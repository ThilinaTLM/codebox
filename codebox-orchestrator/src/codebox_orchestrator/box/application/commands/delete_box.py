"""Delete box command handler."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from codebox_orchestrator.box.application.services.box_query import BoxQueryService
    from codebox_orchestrator.box.infrastructure.box_repository import BoxRepository
    from codebox_orchestrator.box.infrastructure.box_state_store import BoxStateStore
    from codebox_orchestrator.box.ports.event_publisher import EventPublisher
    from codebox_orchestrator.compute.application.commands import RemoveContainerHandler

logger = logging.getLogger(__name__)


class DeleteBoxHandler:
    def __init__(
        self,
        remove_container: RemoveContainerHandler,
        publisher: EventPublisher,
        stop_handler,  # StopBoxHandler — avoid circular import
        query_service: BoxQueryService,
        state_store: BoxStateStore,
        box_repository: BoxRepository,
    ) -> None:
        self._remove_container = remove_container
        self._publisher = publisher
        self._stop = stop_handler
        self._query = query_service
        self._state_store = state_store
        self._box_repository = box_repository

    async def execute(self, box_id: str) -> None:
        await self._stop.execute(box_id)

        box = await self._query.get_box(box_id)
        if box and box.container_name:
            try:
                await self._remove_container.execute(box.container_name)
            except Exception:
                logger.debug("Failed to remove container for box %s", box_id, exc_info=True)

        await self._box_repository.soft_delete(box_id)
        self._state_store.remove(box_id)

        await self._publisher.publish_global_event(
            {
                "type": "box_deleted",
                "box_id": box_id,
            }
        )
