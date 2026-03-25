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
        # token → (entity_id, entity_type)
        self._pending: dict[str, tuple[str, str]] = {}
        # entity_id → WebSocket (inbound from sandbox)
        self._connections: dict[str, WebSocket] = {}
        # entity_id → asyncio.Event (signals when sandbox connects)
        self._connected_events: dict[str, asyncio.Event] = {}
        # entity_id → asyncio.Event (signals when pre-start setup is done and prompt can be sent)
        self._prompt_ready_events: dict[str, asyncio.Event] = {}
        # (entity_id, request_id) → asyncio.Future for file ops
        self._pending_requests: dict[tuple[str, str], asyncio.Future[dict[str, Any]]] = {}

    def register(self, token: str, entity_id: str, entity_type: str) -> None:
        """Register a pending callback token for a sandbox/task."""
        self._pending[token] = (entity_id, entity_type)
        self._connected_events[entity_id] = asyncio.Event()
        self._prompt_ready_events[entity_id] = asyncio.Event()

    def resolve(self, token: str) -> tuple[str, str] | None:
        """Look up and consume a callback token. Returns (entity_id, entity_type) or None."""
        return self._pending.pop(token, None)

    def set_connection(self, entity_id: str, ws: WebSocket) -> None:
        """Store the WebSocket connection from a sandbox container."""
        self._connections[entity_id] = ws
        event = self._connected_events.get(entity_id)
        if event:
            event.set()

    def get_connection(self, entity_id: str) -> WebSocket | None:
        """Get the active WebSocket for an entity."""
        return self._connections.get(entity_id)

    def set_prompt_ready(self, entity_id: str) -> None:
        """Signal that pre-start setup is done and the prompt can be sent."""
        event = self._prompt_ready_events.get(entity_id)
        if event:
            event.set()

    async def wait_for_prompt_ready(self, entity_id: str, timeout: float = 300.0) -> bool:
        """Wait until pre-start setup completes (prompt can be sent), or timeout."""
        event = self._prompt_ready_events.get(entity_id)
        if event is None:
            return False
        try:
            await asyncio.wait_for(event.wait(), timeout=timeout)
            return True
        except asyncio.TimeoutError:
            return False

    def remove(self, entity_id: str) -> None:
        """Clean up all state for an entity."""
        self._connections.pop(entity_id, None)
        self._connected_events.pop(entity_id, None)
        self._prompt_ready_events.pop(entity_id, None)
        # Cancel any pending file-op futures
        to_remove = [k for k in self._pending_requests if k[0] == entity_id]
        for key in to_remove:
            fut = self._pending_requests.pop(key)
            if not fut.done():
                fut.cancel()

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
