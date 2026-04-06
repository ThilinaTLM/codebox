"""Delete box command handler."""

from __future__ import annotations

import contextlib
import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from codebox_orchestrator.box.application.services.box_query import BoxQueryService
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
    ) -> None:
        self._runtime = runtime
        self._publisher = publisher
        self._stop = stop_handler
        self._query = query_service
        self._state_store = state_store

    async def execute(self, box_id: str) -> None:
        # Stop first (cleans up gRPC connection)
        await self._stop.execute(box_id)

        box = self._query.get_box(box_id)
        if box and box.container_name:
            with contextlib.suppress(Exception):
                self._runtime.remove(box.container_name)

        self._state_store.remove(box_id)

        await self._publisher.publish_global_event(
            {
                "type": "box_deleted",
                "box_id": box_id,
            }
        )
