"""Cancel box command handler."""

from __future__ import annotations

import contextlib
from typing import TYPE_CHECKING

from codebox_orchestrator.agent.infrastructure.grpc.generated.codebox.box import box_pb2

if TYPE_CHECKING:
    from codebox_orchestrator.box.ports.agent_connection import AgentConnectionManager


class CancelBoxHandler:
    def __init__(self, connections: AgentConnectionManager) -> None:
        self._connections = connections

    async def execute(self, box_id: str) -> None:
        if self._connections.has_connection(box_id):
            with contextlib.suppress(Exception):
                cmd = box_pb2.BoxCommand(cancel=box_pb2.CancelTask())
                await self._connections.send_command(box_id, cmd)
