"""Event publisher adapter combining relay and global broadcast."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from codebox_orchestrator.shared.messaging.global_broadcast import GlobalBroadcastService
    from codebox_orchestrator.shared.messaging.relay import RelayService

logger = logging.getLogger(__name__)

_PROJECT_SCOPED_GLOBAL_EVENTS = frozenset(
    {
        "box_created",
        "box_deleted",
        "box_status_changed",
        "project_archived",
        "project_restored",
        "project_deleted",
    }
)


class EventPublisherAdapter:
    """Implements EventPublisher by delegating to RelayService + GlobalBroadcastService."""

    def __init__(self, relay: RelayService, global_broadcast: GlobalBroadcastService) -> None:
        self._relay = relay
        self._global_broadcast = global_broadcast

    async def publish_box_event(self, box_id: str, event: dict[str, Any]) -> None:
        """Publish an event to per-box subscribers (SSE clients)."""
        await self._relay.broadcast(box_id, event)

    async def publish_global_event(self, event: dict[str, Any]) -> None:
        """Publish a global lifecycle event.

        Project-scoped events must include ``project_id`` so ``/api/stream``
        can filter them by project membership for non-admin users.
        """
        if event.get("type") in _PROJECT_SCOPED_GLOBAL_EVENTS and not event.get("project_id"):
            logger.warning("Publishing unscoped project lifecycle event: %s", event.get("type"))
        await self._global_broadcast.broadcast(event)

    @property
    def relay(self) -> RelayService:
        """Direct access to relay for SSE subscription (read-side infrastructure)."""
        return self._relay

    @property
    def global_broadcast(self) -> GlobalBroadcastService:
        """Direct access to broadcast for SSE subscription (read-side infrastructure)."""
        return self._global_broadcast
