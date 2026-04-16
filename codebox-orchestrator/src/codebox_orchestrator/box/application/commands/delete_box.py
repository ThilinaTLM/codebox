"""Delete box command handler."""

from __future__ import annotations

import asyncio
import contextlib
import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from codebox_orchestrator.box.application.services.box_query import BoxQueryService
    from codebox_orchestrator.box.infrastructure.box_repository import BoxRepository
    from codebox_orchestrator.box.infrastructure.box_state_store import BoxStateStore
    from codebox_orchestrator.box.ports.container_runtime import ContainerRuntime
    from codebox_orchestrator.box.ports.event_publisher import EventPublisher

logger = logging.getLogger(__name__)


class DeleteBoxHandler:
    def __init__(
        self,
        runtime: ContainerRuntime,
        publisher: EventPublisher,
        stop_handler,  # StopBoxHandler — avoid circular import
        query_service: BoxQueryService,
        state_store: BoxStateStore,
        box_repository: BoxRepository,
    ) -> None:
        self._runtime = runtime
        self._publisher = publisher
        self._stop = stop_handler
        self._query = query_service
        self._state_store = state_store
        self._box_repository = box_repository

    async def execute(self, box_id: str) -> None:
        await self._stop.execute(box_id)

        box = await self._query.get_box(box_id)
        if box and box.container_name:
            loop = asyncio.get_running_loop()
            with contextlib.suppress(Exception):
                await loop.run_in_executor(None, self._runtime.remove, box.container_name)

        await self._box_repository.soft_delete(box_id)
        self._state_store.remove(box_id)

        await self._publisher.publish_global_event(
            {
                "type": "box_deleted",
                "box_id": box_id,
            }
        )
