"""File operation query handlers."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from codebox_orchestrator.agent.domain.exceptions import NoActiveConnectionError
from codebox_orchestrator.agent.infrastructure.grpc.generated.codebox.box import box_pb2

if TYPE_CHECKING:
    from codebox_orchestrator.agent.ports.agent_connection import AgentConnectionManager

_FILE_OP_TIMEOUT = 10.0


class ListFilesHandler:
    def __init__(self, connections: AgentConnectionManager) -> None:
        self._connections = connections

    async def execute(self, box_id: str, path: str = "/workspace") -> dict[str, Any]:
        if not self._connections.has_connection(box_id):
            raise NoActiveConnectionError(box_id)
        query = box_pb2.Query(list_files=box_pb2.ListFilesQuery(path=path))
        result = await self._connections.send_query(box_id, query, timeout=_FILE_OP_TIMEOUT)
        lf = result.list_files
        if lf.error:
            raise RuntimeError(lf.error)
        return {
            "path": path,
            "entries": [
                {
                    "name": e.name,
                    "path": e.path,
                    "is_dir": e.is_dir,
                    "size": e.size,
                    "modified": e.modified,
                }
                for e in lf.entries
            ],
        }


class ReadFileHandler:
    def __init__(self, connections: AgentConnectionManager) -> None:
        self._connections = connections

    async def execute(self, box_id: str, path: str) -> dict[str, Any]:
        if not self._connections.has_connection(box_id):
            raise NoActiveConnectionError(box_id)
        query = box_pb2.Query(read_file=box_pb2.ReadFileQuery(path=path))
        result = await self._connections.send_query(box_id, query, timeout=_FILE_OP_TIMEOUT)
        rf = result.read_file
        if rf.error:
            raise RuntimeError(rf.error)
        return {
            "path": path,
            "content": rf.content,
            "encoding": rf.encoding,
            "truncated": rf.truncated,
        }
