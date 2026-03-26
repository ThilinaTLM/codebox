"""In-memory registry for sandbox callback connections.

Tracks pending callback tokens and active WebSocket connections
from sandbox containers that have connected back to the orchestrator.
"""

from __future__ import annotations

import asyncio
import uuid
from typing import Any

from fastapi import WebSocket


class CallbackRegistry:
    """Maps callback tokens to entity IDs and manages active WS connections."""

    def __init__(self) -> None:
        # entity_id → WebSocket (inbound from sandbox)
        self._connections: dict[str, WebSocket] = {}
        # entity_id → asyncio.Event (signals when sandbox connects)
        self._connected_events: dict[str, asyncio.Event] = {}
        # (entity_id, request_id) → asyncio.Future for file/exec ops
        self._pending_requests: dict[tuple[str, str], asyncio.Future[dict[str, Any]]] = {}

    def init_connection_state(self, entity_id: str) -> None:
        """Prepare connection-tracking state for a new box (idempotent)."""
        if entity_id not in self._connected_events:
            self._connected_events[entity_id] = asyncio.Event()

    def set_connection(self, entity_id: str, ws: WebSocket) -> None:
        """Store the WebSocket connection from a sandbox container."""
        self._connections[entity_id] = ws
        event = self._connected_events.get(entity_id)
        if event:
            event.set()

    def get_connection(self, entity_id: str) -> WebSocket | None:
        """Get the active WebSocket for an entity."""
        return self._connections.get(entity_id)

    def remove(self, entity_id: str) -> None:
        """Clean up connection state for an entity (keeps token alive for reconnection)."""
        self._connections.pop(entity_id, None)
        self._connected_events.pop(entity_id, None)
        # Cancel any pending file-op futures
        to_remove = [k for k in self._pending_requests if k[0] == entity_id]
        for key in to_remove:
            fut = self._pending_requests.pop(key)
            if not fut.done():
                fut.cancel()

    def remove_fully(self, entity_id: str) -> None:
        """Full cleanup (box reached terminal state)."""
        self.remove(entity_id)

    async def wait_for_connection(self, entity_id: str, timeout: float = 60.0) -> bool:
        """Wait until the sandbox connects back, or timeout."""
        event = self._connected_events.get(entity_id)
        if event is None:
            return False
        try:
            await asyncio.wait_for(event.wait(), timeout=timeout)
            return True
        except asyncio.TimeoutError:
            return False

    def create_pending_request(self, entity_id: str) -> tuple[str, asyncio.Future[dict[str, Any]]]:
        """Create a future for a file-op request/response. Returns (request_id, future)."""
        request_id = str(uuid.uuid4())
        loop = asyncio.get_running_loop()
        fut: asyncio.Future[dict[str, Any]] = loop.create_future()
        self._pending_requests[(entity_id, request_id)] = fut
        return request_id, fut

    def resolve_pending_request(
        self, entity_id: str, request_id: str, data: dict[str, Any]
    ) -> None:
        """Resolve a pending file-op future with the response data."""
        key = (entity_id, request_id)
        fut = self._pending_requests.pop(key, None)
        if fut and not fut.done():
            fut.set_result(data)
