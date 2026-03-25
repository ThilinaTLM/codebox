"""In-memory pub/sub relay for broadcasting sandbox events to SSE clients."""

from __future__ import annotations

import asyncio
from typing import Any


class RelayService:
    """Manages per-task event broadcasting from sandbox WebSocket to SSE subscribers."""

    def __init__(self) -> None:
        self._subscribers: dict[str, set[asyncio.Queue[dict[str, Any]]]] = {}

    def subscribe(self, task_id: str) -> asyncio.Queue[dict[str, Any]]:
        """Create and return a new subscriber queue for a task."""
        if task_id not in self._subscribers:
            self._subscribers[task_id] = set()
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        self._subscribers[task_id].add(queue)
        return queue

    def unsubscribe(self, task_id: str, queue: asyncio.Queue[dict[str, Any]]) -> None:
        """Remove a subscriber queue."""
        if task_id in self._subscribers:
            self._subscribers[task_id].discard(queue)
            if not self._subscribers[task_id]:
                del self._subscribers[task_id]

    async def broadcast(self, task_id: str, event: dict[str, Any]) -> None:
        """Push an event to all subscribers of a task."""
        if task_id not in self._subscribers:
            return
        for queue in self._subscribers[task_id]:
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                pass
