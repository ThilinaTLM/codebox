"""Agent connection adapter wrapping CallbackRegistry."""

from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from codebox_orchestrator.agent.infrastructure.callback_registry import CallbackRegistry


class AgentConnectionAdapter:
    """Implements AgentConnectionManager using CallbackRegistry."""

    def __init__(self, registry: CallbackRegistry) -> None:
        self._registry = registry

    @property
    def registry(self) -> CallbackRegistry:
        """Direct access for gRPC server (needs set_connection etc.)."""
        return self._registry

    def has_connection(self, box_id: str) -> bool:
        return self._registry.get_connection(box_id) is not None

    async def send_command(self, box_id: str, command: dict[str, Any]) -> None:
        conn = self._registry.get_connection(box_id)
        if conn is None:
            from codebox_orchestrator.agent.domain.exceptions import NoActiveConnectionError  # noqa: PLC0415

            raise NoActiveConnectionError(box_id)
        await conn.send_json(command)

    async def send_and_wait(
        self, box_id: str, command: dict[str, Any], timeout: float  # noqa: ASYNC109
    ) -> dict[str, Any]:
        conn = self._registry.get_connection(box_id)
        if conn is None:
            from codebox_orchestrator.agent.domain.exceptions import NoActiveConnectionError  # noqa: PLC0415

            raise NoActiveConnectionError(box_id)
        request_id, fut = self._registry.create_pending_request(box_id)
        command["request_id"] = request_id
        await conn.send_json(command)
        return await asyncio.wait_for(fut, timeout=timeout)

    async def wait_for_connection(self, box_id: str, timeout: float) -> bool:  # noqa: ASYNC109
        return await self._registry.wait_for_connection(box_id, timeout=timeout)

    def init_connection_state(self, box_id: str) -> None:
        self._registry.init_connection_state(box_id)

    def remove_connection(self, box_id: str) -> None:
        self._registry.remove(box_id)

    def remove_connection_fully(self, box_id: str) -> None:
        self._registry.remove_fully(box_id)
