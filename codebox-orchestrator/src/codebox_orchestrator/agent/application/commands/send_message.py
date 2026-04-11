"""Send message command handler."""

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


class SendMessageHandler:
    def __init__(
        self,
        publisher: EventPublisher,
        connections: AgentConnectionManager,
        repository: SqlAlchemyBoxEventRepository,
    ) -> None:
        self._publisher = publisher
        self._connections = connections
        self._repository = repository

    async def execute(self, box_id: str, content: str) -> None:
        run_id = _new_id("run")
        message_id = _new_id("msg")
        stored = await self._repository.append_event(
            box_id,
            {
                "kind": "message.completed",
                "run_id": run_id,
                "message_id": message_id,
                "payload": {"role": "user", "content": content},
            },
        )
        await self._publisher.publish_box_event(box_id, stored)

        if not self._connections.has_connection(box_id):
            raise NoActiveConnectionError(box_id)
        cmd = box_pb2.BoxCommand(
            message=box_pb2.SendMessage(content=content, run_id=run_id, message_id=message_id)
        )
        await self._connections.send_command(box_id, cmd)
