"""Stop box command handler."""

from __future__ import annotations

import asyncio
import contextlib
import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from codebox_orchestrator.box.application.services.box_query import BoxQueryService
    from codebox_orchestrator.box.ports.agent_connection import AgentConnectionManager
    from codebox_orchestrator.box.ports.container_runtime import ContainerRuntime
    from codebox_orchestrator.box.ports.event_publisher import EventPublisher

logger = logging.getLogger(__name__)


class StopBoxHandler:
    def __init__(
        self,
        runtime: ContainerRuntime,
        connections: AgentConnectionManager,
        publisher: EventPublisher,
        query_service: BoxQueryService,
    ) -> None:
        self._runtime = runtime
        self._connections = connections
        self._publisher = publisher
        self._query = query_service

    async def execute(self, box_id: str) -> None:
        self._connections.remove_connection_fully(box_id)

        box = self._query.get_box(box_id)
        if box is None or box.container_status == "stopped":
            return

        if box.container_name:
            loop = asyncio.get_running_loop()
            with contextlib.suppress(Exception):
                await loop.run_in_executor(None, self._runtime.stop, box.container_name)

        await self._publisher.publish_box_event(
            box_id,
            {
                "type": "status_change",
                "container_status": "stopped",
                "container_stop_reason": "user_stopped",
            },
        )
        await self._publisher.publish_global_event(
            {
                "type": "box_status_changed",
                "box_id": box_id,
                "container_status": "stopped",
                "container_stop_reason": "user_stopped",
            }
        )
