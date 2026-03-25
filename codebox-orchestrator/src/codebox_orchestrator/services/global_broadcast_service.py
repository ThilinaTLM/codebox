"""Global pub/sub for broadcasting platform-level events to all connected clients."""

from __future__ import annotations

import asyncio
from typing import Any


class GlobalBroadcastService:
    """Broadcasts box lifecycle events (created, status changed, deleted) to all subscribers."""

    def __init__(self) -> None:
        self._subscribers: set[asyncio.Queue[dict[str, Any]]] = set()

    def subscribe(self) -> asyncio.Queue[dict[str, Any]]:
        """Create and return a new subscriber queue."""
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        self._subscribers.add(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue[dict[str, Any]]) -> None:
        """Remove a subscriber queue."""
        self._subscribers.discard(queue)

    async def broadcast(self, event: dict[str, Any]) -> None:
        """Push an event to all subscribers."""
        for queue in self._subscribers:
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                pass
