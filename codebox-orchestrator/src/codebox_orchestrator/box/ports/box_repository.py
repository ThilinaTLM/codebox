"""Box repository port."""

from __future__ import annotations

from typing import Protocol

from codebox_orchestrator.box.domain.entities import Box, BoxEvent, BoxMessage, FeedbackRequest
from codebox_orchestrator.box.domain.enums import Activity, ContainerStatus


class BoxFilters:
    """Filter criteria for listing boxes."""

    def __init__(
        self,
        container_status: ContainerStatus | None = None,
        activity: Activity | None = None,
        trigger: str | None = None,
    ) -> None:
        self.container_status = container_status
        self.activity = activity
        self.trigger = trigger


class BoxRepository(Protocol):
    async def get(self, box_id: str) -> Box | None: ...
    async def save(self, box: Box) -> None: ...
    async def delete(self, box_id: str) -> None: ...
    async def list(self, filters: BoxFilters | None = None) -> list[Box]: ...
    async def add_event(self, box_id: str, event_type: str, data: str) -> None: ...
    async def add_message(self, box_id: str, message: BoxMessage) -> None: ...
    async def get_events(self, box_id: str) -> list[BoxEvent]: ...
    async def get_messages(self, box_id: str) -> list[BoxMessage]: ...
    async def get_next_message_seq(self, box_id: str) -> int: ...
