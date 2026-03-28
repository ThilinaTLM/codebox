"""Event publisher adapter combining relay and global broadcast."""

from __future__ import annotations

from typing import Any

from codebox_orchestrator.shared.messaging.global_broadcast import GlobalBroadcastService
from codebox_orchestrator.shared.messaging.relay import RelayService


class EventPublisherAdapter:
    """Implements EventPublisher by delegating to RelayService + GlobalBroadcastService."""

    def __init__(self, relay: RelayService, global_broadcast: GlobalBroadcastService) -> None:
        self._relay = relay
        self._global_broadcast = global_broadcast

    async def publish_box_event(self, box_id: str, event: dict[str, Any]) -> None:
        """Publish an event to per-box subscribers (SSE clients)."""
        await self._relay.broadcast(box_id, event)

    async def publish_global_event(self, event: dict[str, Any]) -> None:
        """Publish a platform-level event (box created/deleted/status changed)."""
        await self._global_broadcast.broadcast(event)

    @property
    def relay(self) -> RelayService:
        """Direct access to relay for SSE subscription (read-side infrastructure)."""
        return self._relay

    @property
    def global_broadcast(self) -> GlobalBroadcastService:
        """Direct access to broadcast for SSE subscription (read-side infrastructure)."""
        return self._global_broadcast
