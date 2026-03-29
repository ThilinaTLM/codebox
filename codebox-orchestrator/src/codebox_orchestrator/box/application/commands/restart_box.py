"""Restart box command handler."""

from __future__ import annotations

from typing import TYPE_CHECKING

from codebox_orchestrator.box.domain.enums import ContainerStatus
from codebox_orchestrator.box.domain.exceptions import (
    BoxNotFoundError,
    InvalidStatusTransitionError,
)

if TYPE_CHECKING:
    from codebox_orchestrator.box.domain.entities import Box
    from codebox_orchestrator.box.ports.box_repository import BoxRepository
    from codebox_orchestrator.box.ports.event_publisher import EventPublisher


class RestartBoxHandler:
    def __init__(self, repo: BoxRepository, publisher: EventPublisher) -> None:
        self._repo = repo
        self._publisher = publisher

    async def execute(self, box_id: str) -> Box:
        box = await self._repo.get(box_id)
        if box is None:
            raise BoxNotFoundError(box_id)
        if box.container_status != ContainerStatus.STOPPED:
            raise InvalidStatusTransitionError(box.container_status.value, "starting")

        box.mark_starting()
        await self._repo.save(box)

        await self._publisher.publish_box_event(
            box_id, {"type": "status_change", "container_status": ContainerStatus.STARTING.value}
        )
        await self._publisher.publish_global_event(
            {
                "type": "box_status_changed",
                "box_id": box_id,
                "container_status": ContainerStatus.STARTING.value,
            }
        )
        return box
