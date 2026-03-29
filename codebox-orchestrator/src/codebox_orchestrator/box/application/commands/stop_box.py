"""Stop box command handler."""

from __future__ import annotations

import contextlib
import logging
from typing import TYPE_CHECKING

from codebox_orchestrator.box.domain.enums import ContainerStatus

if TYPE_CHECKING:
    from codebox_orchestrator.box.ports.agent_connection import AgentConnectionManager
    from codebox_orchestrator.box.ports.box_repository import BoxRepository
    from codebox_orchestrator.box.ports.container_runtime import ContainerRuntime
    from codebox_orchestrator.box.ports.event_publisher import EventPublisher

logger = logging.getLogger(__name__)


class StopBoxHandler:
    def __init__(
        self,
        repo: BoxRepository,
        runtime: ContainerRuntime,
        connections: AgentConnectionManager,
        publisher: EventPublisher,
    ) -> None:
        self._repo = repo
        self._runtime = runtime
        self._connections = connections
        self._publisher = publisher

    async def execute(self, box_id: str) -> None:
        self._connections.remove_connection_fully(box_id)

        box = await self._repo.get(box_id)
        if box is None or box.container_status == ContainerStatus.STOPPED:
            return

        box.stop("user_stopped")
        await self._repo.save(box)

        if box.container_name:
            with contextlib.suppress(Exception):
                self._runtime.stop(box.container_name)

        await self._publisher.publish_box_event(
            box_id,
            {
                "type": "status_change",
                "container_status": ContainerStatus.STOPPED.value,
                "container_stop_reason": "user_stopped",
            },
        )
        await self._publisher.publish_global_event(
            {
                "type": "box_status_changed",
                "box_id": box_id,
                "container_status": ContainerStatus.STOPPED.value,
                "container_stop_reason": "user_stopped",
            }
        )
