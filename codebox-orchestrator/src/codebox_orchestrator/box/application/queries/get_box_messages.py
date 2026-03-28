"""Get box messages query handler."""
from __future__ import annotations

from codebox_orchestrator.box.domain.entities import BoxMessage
from codebox_orchestrator.box.ports.box_repository import BoxRepository


class GetBoxMessagesHandler:
    def __init__(self, repo: BoxRepository) -> None:
        self._repo = repo

    async def execute(self, box_id: str) -> list[BoxMessage]:
        return await self._repo.get_messages(box_id)
