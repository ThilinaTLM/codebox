"""Delete box command handler."""

from __future__ import annotations

import logging

from codebox_orchestrator.box.ports.box_repository import BoxRepository
from codebox_orchestrator.box.ports.container_runtime import ContainerRuntime
from codebox_orchestrator.box.ports.event_publisher import EventPublisher

logger = logging.getLogger(__name__)


class DeleteBoxHandler:
    def __init__(
        self,
        repo: BoxRepository,
        runtime: ContainerRuntime,
        publisher: EventPublisher,
        stop_handler,  # StopBoxHandler — avoid circular import
    ) -> None:
        self._repo = repo
        self._runtime = runtime
        self._publisher = publisher
        self._stop = stop_handler

    async def execute(self, box_id: str) -> None:
        await self._stop.execute(box_id)

        box = await self._repo.get(box_id)
        if box and box.container_name:
            try:
                self._runtime.remove(box.container_name)
            except Exception:
                pass

        await self._repo.delete(box_id)
        await self._publisher.publish_global_event({
            "type": "box_deleted",
            "box_id": box_id,
        })
