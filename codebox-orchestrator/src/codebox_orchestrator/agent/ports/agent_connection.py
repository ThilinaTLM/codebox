"""Canonical agent connection manager port definition."""

from __future__ import annotations

from typing import Any, Protocol

from codebox_orchestrator.agent.infrastructure.grpc.generated.codebox.box import (
    box_pb2,  # noqa: TC001
)


class AgentConnectionManager(Protocol):
    def has_connection(self, box_id: str) -> bool: ...
    async def send_command(self, box_id: str, command: box_pb2.BoxCommand) -> None: ...
    async def send_query(
        self,
        box_id: str,
        query: box_pb2.Query,
        timeout: float,  # noqa: ASYNC109
    ) -> Any: ...
    async def wait_for_connection(self, box_id: str, timeout: float) -> bool: ...  # noqa: ASYNC109
    def init_connection_state(self, box_id: str) -> None: ...
    def remove_connection(self, box_id: str) -> None: ...
    def remove_connection_fully(self, box_id: str) -> None: ...
