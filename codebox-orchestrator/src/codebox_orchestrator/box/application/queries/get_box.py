"""Get box query handler."""
from __future__ import annotations

from codebox_orchestrator.box.domain.entities import Box
from codebox_orchestrator.box.ports.box_repository import BoxRepository


class GetBoxHandler:
    def __init__(self, repo: BoxRepository) -> None:
        self._repo = repo

    async def execute(self, box_id: str) -> Box | None:
        return await self._repo.get(box_id)
