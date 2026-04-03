"""Restart box command handler."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from codebox_orchestrator.box.application.services.box_query import BoxQueryService
    from codebox_orchestrator.box.domain.views import BoxView
    from codebox_orchestrator.box.ports.container_runtime import ContainerRuntime
    from codebox_orchestrator.box.ports.event_publisher import EventPublisher


class RestartBoxHandler:
    def __init__(
        self,
        runtime: ContainerRuntime,
        publisher: EventPublisher,
        query_service: BoxQueryService,
    ) -> None:
        self._runtime = runtime
        self._publisher = publisher
        self._query = query_service

    async def execute(self, box_id: str) -> BoxView:
        box = self._query.get_box(box_id)
        if box is None:
            from codebox_orchestrator.box.domain.exceptions import (  # noqa: PLC0415
                BoxNotFoundError,
            )

            raise BoxNotFoundError(box_id)
        if box.container_status != "stopped":
            from codebox_orchestrator.box.domain.exceptions import (  # noqa: PLC0415
                InvalidStatusTransitionError,
            )

            raise InvalidStatusTransitionError(box.container_status, "starting")

        self._runtime.start(box.container_name)

        await self._publisher.publish_box_event(
            box_id, {"type": "status_change", "container_status": "starting"}
        )
        await self._publisher.publish_global_event(
            {
                "type": "box_status_changed",
                "box_id": box_id,
                "container_status": "starting",
            }
        )
        return box
