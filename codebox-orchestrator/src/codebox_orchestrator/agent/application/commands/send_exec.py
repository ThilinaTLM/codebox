"""Send exec command handlers."""

from __future__ import annotations

from typing import TYPE_CHECKING

from codebox_orchestrator.agent.domain.exceptions import NoActiveConnectionError

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
        """Send a shell command for execution (fire and forget)."""
        event_data = {"type": "user_exec", "command": command}
        await self._publisher.publish_box_event(box_id, event_data)

        if not self._connections.has_connection(box_id):
            raise NoActiveConnectionError(box_id)
        await self._connections.send_command(box_id, {"type": "exec", "content": command})

    async def execute_and_wait(self, box_id: str, command: str, timeout: float = 120.0) -> dict:  # noqa: ASYNC109
        """Send a shell command and wait for exec_done response."""
        if not self._connections.has_connection(box_id):
            raise NoActiveConnectionError(box_id)
        result = await self._connections.send_and_wait(
            box_id, {"type": "exec", "content": command}, timeout=timeout
        )
        exit_code = result.get("output", "")
        if exit_code not in ("0", ""):
            raise RuntimeError(f"Setup command failed (exit {exit_code}): {command}")
        return result
