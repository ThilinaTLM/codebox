"""List boxes query handler."""
from __future__ import annotations

from codebox_orchestrator.box.domain.entities import Box
from codebox_orchestrator.box.domain.enums import ContainerStatus, TaskStatus
from codebox_orchestrator.box.ports.box_repository import BoxFilters, BoxRepository


class ListBoxesHandler:
    def __init__(self, repo: BoxRepository) -> None:
        self._repo = repo

    async def execute(
        self,
        container_status: ContainerStatus | None = None,
        task_status: TaskStatus | None = None,
        trigger: str | None = None,
    ) -> list[Box]:
        filters = BoxFilters(
            container_status=container_status,
            task_status=task_status,
            trigger=trigger,
        )
        return await self._repo.list(filters)
