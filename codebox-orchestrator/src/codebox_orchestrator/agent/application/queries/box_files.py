"""File operation query handlers."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from codebox_orchestrator.agent.domain.exceptions import NoActiveConnectionError

if TYPE_CHECKING:
    from codebox_orchestrator.agent.ports.agent_connection import AgentConnectionManager

_FILE_OP_TIMEOUT = 10.0


class ListFilesHandler:
    def __init__(self, connections: AgentConnectionManager) -> None:
        self._connections = connections

    async def execute(self, box_id: str, path: str = "/workspace") -> dict[str, Any]:
        if not self._connections.has_connection(box_id):
            raise NoActiveConnectionError(box_id)
        result = await self._connections.send_and_wait(
            box_id, {"type": "list_files", "path": path}, timeout=_FILE_OP_TIMEOUT
        )
        if "error" in result:
            raise RuntimeError(result["error"])
        return result.get("data", {})


class ReadFileHandler:
    def __init__(self, connections: AgentConnectionManager) -> None:
        self._connections = connections

    async def execute(self, box_id: str, path: str) -> dict[str, Any]:
        if not self._connections.has_connection(box_id):
            raise NoActiveConnectionError(box_id)
        result = await self._connections.send_and_wait(
            box_id, {"type": "read_file", "path": path}, timeout=_FILE_OP_TIMEOUT
        )
        if "error" in result:
            raise RuntimeError(result["error"])
        return result.get("data", {})
