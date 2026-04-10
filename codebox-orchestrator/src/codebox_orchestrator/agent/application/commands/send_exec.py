"""Send exec command handlers."""

from __future__ import annotations

from typing import TYPE_CHECKING

from codebox_orchestrator.agent.domain.exceptions import NoActiveConnectionError
from codebox_orchestrator.agent.infrastructure.grpc.generated.codebox.box import box_pb2

if TYPE_CHECKING:
    from codebox_orchestrator.agent.ports.agent_connection import AgentConnectionManager
    from codebox_orchestrator.box.ports.event_publisher import EventPublisher


class SendExecHandler:
    def __init__(
        self,
        publisher: EventPublisher,
        connections: AgentConnectionManager,
    ) -> None:
        self._publisher = publisher
        self._connections = connections

    async def execute(self, box_id: str, command: str) -> None:
        """Send a shell command for execution (fire and forget).

        Output streams back as AgentOutput.exec_chunk events via SSE.
        """
        event_data = {"type": "user_exec", "command": command}
        await self._publisher.publish_box_event(box_id, event_data)

        if not self._connections.has_connection(box_id):
            raise NoActiveConnectionError(box_id)
        query = box_pb2.Query(exec=box_pb2.ExecQuery(command=command))
        cmd = box_pb2.BoxCommand(query=query)
        await self._connections.send_command(box_id, cmd)

    async def execute_and_wait(self, box_id: str, command: str, timeout: float = 120.0) -> int:  # noqa: ASYNC109
        """Send a shell command and wait for ExecResult. Returns exit code."""
        if not self._connections.has_connection(box_id):
            raise NoActiveConnectionError(box_id)
        query = box_pb2.Query(exec=box_pb2.ExecQuery(command=command))
        result = await self._connections.send_query(box_id, query, timeout=timeout)
        exec_result = result.exec
        if exec_result.error:
            raise RuntimeError(f"Exec failed: {exec_result.error}")
        if exec_result.exit_code != 0:
            raise RuntimeError(f"Setup command failed (exit {exec_result.exit_code}): {command}")
        return exec_result.exit_code
