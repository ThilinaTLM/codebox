"""Event publisher port."""

from __future__ import annotations

from typing import Any, Protocol


class EventPublisher(Protocol):
    async def publish_box_event(self, box_id: str, event: dict[str, Any]) -> None:
        """Publish an event to per-box subscribers (SSE clients)."""
        ...

    async def publish_global_event(self, event: dict[str, Any]) -> None:
        """Publish a platform-level event (box created/deleted/status changed)."""
        ...
