"""List boxes query handler."""
from __future__ import annotations

from codebox_orchestrator.box.domain.entities import Box
from codebox_orchestrator.box.domain.enums import Activity, ContainerStatus
from codebox_orchestrator.box.ports.box_repository import BoxFilters, BoxRepository


class ListBoxesHandler:
    def __init__(self, repo: BoxRepository) -> None:
        self._repo = repo

    async def execute(
        self,
        container_status: ContainerStatus | None = None,
        activity: Activity | None = None,
        trigger: str | None = None,
    ) -> list[Box]:
        filters = BoxFilters(
            container_status=container_status,
            activity=activity,
            trigger=trigger,
        )
        return await self._repo.list(filters)
