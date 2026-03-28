"""Cancel box command handler."""

from __future__ import annotations

from codebox_orchestrator.box.ports.agent_connection import AgentConnectionManager


class CancelBoxHandler:
    def __init__(self, connections: AgentConnectionManager) -> None:
        self._connections = connections

    async def execute(self, box_id: str) -> None:
        if self._connections.has_connection(box_id):
            try:
                await self._connections.send_command(box_id, {"type": "cancel"})
            except Exception:
                pass
