"""Get box events query handler."""
from __future__ import annotations

from codebox_orchestrator.box.domain.entities import BoxEvent
from codebox_orchestrator.box.ports.box_repository import BoxRepository


class GetBoxEventsHandler:
    def __init__(self, repo: BoxRepository) -> None:
        self._repo = repo

    async def execute(self, box_id: str) -> list[BoxEvent]:
        return await self._repo.get_events(box_id)
