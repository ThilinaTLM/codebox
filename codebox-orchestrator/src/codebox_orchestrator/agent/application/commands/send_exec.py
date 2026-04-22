"""Send exec command handler.

Only ``execute_and_wait`` remains; it is used by ``BoxLifecycleService``
to run container initialisation scripts synchronously.  The old fire-
and-forget ``execute`` path (driven by the ``POST /boxes/{id}/exec``
route and the chat ``$ cmd`` shortcut) has been removed — interactive
shell use now lives on the Terminal tab and flows through the PTY
tunnel, bypassing the event stream entirely.
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from codebox_orchestrator.agent.domain.exceptions import NoActiveConnectionError
from codebox_orchestrator.agent.infrastructure.grpc.generated.codebox.box import box_pb2

if TYPE_CHECKING:
    from codebox_orchestrator.agent.ports.agent_connection import AgentConnectionManager


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex}"


class SendExecHandler:
    def __init__(self, connections: AgentConnectionManager) -> None:
        self._connections = connections

    async def execute_and_wait(
        self,
        box_id: str,
        command: str,
        timeout: float = 120.0,  # noqa: ASYNC109 — matches caller signature
    ) -> int:
        """Send a shell command and wait for its ``ExecResult``.

        Used by ``BoxLifecycleService`` for init scripts.  The
        ``run_id`` / ``command_id`` values are generated locally for the
        gRPC query and are **not** written to the event store — init
        script activity does not belong in the replayable box history.

        Returns the exit code on success; raises ``RuntimeError`` if
        the sandbox reports an error or a non-zero exit.
        """
        if not self._connections.has_connection(box_id):
            raise NoActiveConnectionError(box_id)
        run_id = _new_id("run")
        command_id = _new_id("cmd")
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
