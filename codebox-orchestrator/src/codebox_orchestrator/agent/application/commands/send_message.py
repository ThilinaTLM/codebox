"""Send message command handler."""

from __future__ import annotations

import json
from typing import TYPE_CHECKING

from codebox_orchestrator.agent.domain.exceptions import NoActiveConnectionError
from codebox_orchestrator.box.domain.entities import BoxMessage

if TYPE_CHECKING:
    from codebox_orchestrator.agent.ports.agent_connection import AgentConnectionManager
    from codebox_orchestrator.box.ports.box_repository import BoxRepository
    from codebox_orchestrator.box.ports.event_publisher import EventPublisher


class SendMessageHandler:
    def __init__(
        self,
        repo: BoxRepository,
        publisher: EventPublisher,
        connections: AgentConnectionManager,
    ) -> None:
        self._repo = repo
        self._publisher = publisher
        self._connections = connections

    async def execute(self, box_id: str, content: str) -> None:
        # Persist user message
        msg = BoxMessage(box_id=box_id, seq=0, role="user", content=content)
        await self._repo.add_message(box_id, msg)

        # Persist as event for replay
        event_data = {"type": "user_message", "content": content}
        await self._repo.add_event(box_id, "user_message", json.dumps(event_data))

        # Broadcast to SSE
        await self._publisher.publish_box_event(box_id, event_data)

        # Forward to sandbox
        if not self._connections.has_connection(box_id):
            raise NoActiveConnectionError(box_id)
        await self._connections.send_command(box_id, {"type": "message", "content": content})
