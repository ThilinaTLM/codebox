"""In-memory registry for box callback connections.

Tracks active connections from box containers and manages
pending request/response pairs (queries via the gRPC stream).

Transport-agnostic: uses an asyncio.Queue-based ConnectionHandle.
"""

from __future__ import annotations

import asyncio
import uuid
from typing import Any


class ConnectionHandle:
    """Abstraction over a command channel to a box container.

    The command queue holds BoxCommand protobuf objects directly.
    """

    def __init__(self) -> None:
        self.command_queue: asyncio.Queue[Any] = asyncio.Queue()


class CallbackRegistry:
    """Maps entity IDs to active connections and manages pending requests."""

    def __init__(self) -> None:
        # entity_id → ConnectionHandle
        self._connections: dict[str, ConnectionHandle] = {}
        # entity_id → asyncio.Event (signals when box connects)
        self._connected_events: dict[str, asyncio.Event] = {}
        # (entity_id, request_id) → asyncio.Future for query responses
        self._pending_requests: dict[tuple[str, str], asyncio.Future[Any]] = {}
        # entity_id → {activity, box_outcome, box_outcome_message} — last-known live state
        self._live_state: dict[str, dict[str, str]] = {}

    def init_connection_state(self, entity_id: str) -> None:
        """Prepare connection-tracking state for a new box (idempotent)."""
        if entity_id not in self._connected_events:
            self._connected_events[entity_id] = asyncio.Event()

    def set_connection(self, entity_id: str, handle: ConnectionHandle) -> None:
        """Store the connection handle from a box container."""
        self._connections[entity_id] = handle
        event = self._connected_events.get(entity_id)
        if event:
            event.set()

    def get_connection(self, entity_id: str) -> ConnectionHandle | None:
        """Get the active connection handle for an entity."""
        return self._connections.get(entity_id)

    def remove(self, entity_id: str) -> None:
        """Clean up connection state (keeps token alive for reconnection)."""
        self._connections.pop(entity_id, None)
        self._connected_events.pop(entity_id, None)
        # Cancel any pending query futures
        to_remove = [k for k in self._pending_requests if k[0] == entity_id]
        for key in to_remove:
            fut = self._pending_requests.pop(key)
            if not fut.done():
                fut.cancel()

    def remove_fully(self, entity_id: str) -> None:
        """Full cleanup (box reached terminal state)."""
        self.remove(entity_id)
        self._live_state.pop(entity_id, None)

    # -- Live state cache --

    def update_live_state(self, entity_id: str, key: str, value: str) -> None:
        """Update a single key in the cached live state for an entity."""
        if entity_id not in self._live_state:
            self._live_state[entity_id] = {}
        self._live_state[entity_id][key] = value

    def get_live_state(self, entity_id: str) -> dict[str, str]:
        """Return the cached live state dict for an entity."""
        return dict(self._live_state.get(entity_id, {}))

    async def wait_for_connection(self, entity_id: str, timeout: float = 60.0) -> bool:  # noqa: ASYNC109
        """Wait until the box connects back, or timeout."""
        event = self._connected_events.get(entity_id)
        if event is None:
            return False
        try:
            await asyncio.wait_for(event.wait(), timeout=timeout)
        except TimeoutError:
            return False
        else:
            return True

    def create_pending_request(self, entity_id: str) -> tuple[str, asyncio.Future[Any]]:
        """Create a future for a query request/response. Returns (request_id, future)."""
        request_id = str(uuid.uuid4())
        loop = asyncio.get_running_loop()
        fut: asyncio.Future[Any] = loop.create_future()
        self._pending_requests[(entity_id, request_id)] = fut
        return request_id, fut

    def resolve_pending_request(self, entity_id: str, request_id: str, data: Any) -> None:
        """Resolve a pending query future with the response data."""
        key = (entity_id, request_id)
        fut = self._pending_requests.pop(key, None)
        if fut and not fut.done():
            fut.set_result(data)
