"""Send message command handler."""

from __future__ import annotations

from typing import TYPE_CHECKING

from codebox_orchestrator.agent.domain.exceptions import NoActiveConnectionError
from codebox_orchestrator.agent.infrastructure.grpc.generated.codebox.box import box_pb2

if TYPE_CHECKING:
    from codebox_orchestrator.agent.ports.agent_connection import AgentConnectionManager
    from codebox_orchestrator.box.ports.event_publisher import EventPublisher


class SendMessageHandler:
    def __init__(
        self,
        publisher: EventPublisher,
        connections: AgentConnectionManager,
    ) -> None:
        self._publisher = publisher
        self._connections = connections

    async def execute(self, box_id: str, content: str) -> None:
        # Broadcast to SSE
        event_data = {"type": "user_message", "content": content}
        await self._publisher.publish_box_event(box_id, event_data)

        # Forward to box (box persists messages in its own SQLite)
        if not self._connections.has_connection(box_id):
            raise NoActiveConnectionError(box_id)
        cmd = box_pb2.BoxCommand(message=box_pb2.SendMessage(content=content))
        await self._connections.send_command(box_id, cmd)
