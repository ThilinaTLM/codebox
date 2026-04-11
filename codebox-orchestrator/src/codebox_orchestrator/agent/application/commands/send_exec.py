"""Send exec command handlers."""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from codebox_orchestrator.agent.domain.exceptions import NoActiveConnectionError
from codebox_orchestrator.agent.infrastructure.grpc.generated.codebox.box import box_pb2

if TYPE_CHECKING:
    from codebox_orchestrator.agent.infrastructure.event_repository import (
        SqlAlchemyBoxEventRepository,
    )
    from codebox_orchestrator.agent.ports.agent_connection import AgentConnectionManager
    from codebox_orchestrator.box.ports.event_publisher import EventPublisher


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex}"


class SendExecHandler:
    def __init__(
        self,
        publisher: EventPublisher,
        connections: AgentConnectionManager,
        repository: SqlAlchemyBoxEventRepository,
    ) -> None:
        self._publisher = publisher
        self._connections = connections
        self._repository = repository

    async def _send_command_started(self, box_id: str, command: str) -> tuple[str, str]:
        run_id = _new_id("run")
        command_id = _new_id("cmd")
        stored = await self._repository.append_event(
            box_id,
            {
                "kind": "command.started",
                "run_id": run_id,
                "command_id": command_id,
                "payload": {
                    "origin": "user_exec",
                    "command": command,
                    "timeout_seconds": 0,
                },
            },
        )
        await self._publisher.publish_box_event(box_id, stored)
        return run_id, command_id

    async def execute(self, box_id: str, command: str) -> None:
        """Send a shell command for execution (fire and forget)."""
        if not self._connections.has_connection(box_id):
            raise NoActiveConnectionError(box_id)
        run_id, command_id = await self._send_command_started(box_id, command)
        query = box_pb2.Query(
            exec=box_pb2.ExecQuery(command=command, run_id=run_id, command_id=command_id)
        )
        cmd = box_pb2.BoxCommand(query=query)
        await self._connections.send_command(box_id, cmd)

    async def execute_and_wait(self, box_id: str, command: str, timeout: float = 120.0) -> int:  # noqa: ASYNC109
        """Send a shell command and wait for ExecResult. Returns exit code."""
        if not self._connections.has_connection(box_id):
            raise NoActiveConnectionError(box_id)
        run_id, command_id = await self._send_command_started(box_id, command)
        query = box_pb2.Query(
            exec=box_pb2.ExecQuery(command=command, run_id=run_id, command_id=command_id)
        )
        result = await self._connections.send_query(box_id, query, timeout=timeout)
        exec_result = result.exec
        if exec_result.error:
            raise RuntimeError(f"Exec failed: {exec_result.error}")
        if exec_result.exit_code != 0:
            raise RuntimeError(f"Setup command failed (exit {exec_result.exit_code}): {command}")
        return exec_result.exit_code
