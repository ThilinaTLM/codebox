"""Canonical agent connection manager port definition."""

from __future__ import annotations

from typing import Any, Protocol


class AgentConnectionManager(Protocol):
    def has_connection(self, box_id: str) -> bool: ...
    async def send_command(self, box_id: str, command: dict[str, Any]) -> None: ...
    async def send_and_wait(
        self,
        box_id: str,
        command: dict[str, Any],
        timeout: float,  # noqa: ASYNC109
    ) -> dict[str, Any]: ...
    async def wait_for_connection(self, box_id: str, timeout: float) -> bool: ...  # noqa: ASYNC109
    def init_connection_state(self, box_id: str) -> None: ...
    def remove_connection(self, box_id: str) -> None: ...
    def remove_connection_fully(self, box_id: str) -> None: ...
