"""Handle box event command handler.

Processes events from box containers. The orchestrator caches live state
in the CallbackRegistry and broadcasts events via SSE.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from codebox_orchestrator.agent.infrastructure.grpc.generated.codebox.box import (
    box_pb2,  # noqa: TC001
)
from codebox_orchestrator.agent.infrastructure.grpc.sse_convert import agent_output_to_sse

if TYPE_CHECKING:
    from codebox_orchestrator.agent.infrastructure.callback_registry import CallbackRegistry
    from codebox_orchestrator.box.ports.event_publisher import EventPublisher

logger = logging.getLogger(__name__)


class HandleBoxEventHandler:
    """Processes a single event from a box container."""

    def __init__(
        self,
        publisher: EventPublisher,
        registry: CallbackRegistry,
    ) -> None:
        self._publisher = publisher
        self._registry = registry

    async def execute(self, box_id: str, event: box_pb2.BoxEvent) -> None:
        """Process a single box event (protobuf)."""
        field = event.WhichOneof("event")
        if not field:
            return

        # Query results → resolve pending future (generic)
        if field == "query_result":
            qr = event.query_result
            self._registry.resolve_pending_request(box_id, qr.request_id, qr)
            return

        # State changes → cache + broadcast
        if field == "state_change":
            await self._handle_state_change(box_id, event.state_change)
            return

        # Agent output → convert to SSE dict and broadcast
        if field == "agent_output":
            sse_dict = agent_output_to_sse(event.agent_output)
            if sse_dict:
                await self._publisher.publish_box_event(box_id, sse_dict)
            return

        # Lifecycle events
        if field == "done":
            await self._publisher.publish_box_event(
                box_id, {"type": "done", "content": event.done.content}
            )
        elif field == "error":
            await self._publisher.publish_box_event(
                box_id, {"type": "error", "detail": event.error.detail}
            )

    async def _handle_state_change(self, box_id: str, sc: box_pb2.StateChange) -> None:
        """Handle state change events: cache in registry and broadcast."""
        change = sc.WhichOneof("change")
        if change == "activity":
            status = sc.activity.status
            self._registry.update_live_state(box_id, "activity", status)
            await self._publisher.publish_box_event(
                box_id, {"type": "status_change", "activity": status}
            )
            await self._publisher.publish_global_event(
                {"type": "box_status_changed", "box_id": box_id, "activity": status}
            )
        elif change == "outcome":
            status = sc.outcome.status
            message = sc.outcome.message
            self._registry.update_live_state(box_id, "task_outcome", status)
            self._registry.update_live_state(box_id, "task_outcome_message", message)
            await self._publisher.publish_box_event(
                box_id,
                {
                    "type": "status_change",
                    "task_outcome": status,
                    "task_outcome_message": message,
                },
            )
            await self._publisher.publish_global_event(
                {"type": "box_status_changed", "box_id": box_id, "task_outcome": status}
            )

    async def set_container_stopped(self, box_id: str, reason: str) -> None:
        """Broadcast container-stopped events (called on gRPC disconnect)."""
        self._registry.update_live_state(box_id, "activity", "idle")
        await self._publisher.publish_box_event(
            box_id,
            {
                "type": "status_change",
                "container_status": "stopped",
                "container_stop_reason": reason,
            },
        )
        await self._publisher.publish_global_event(
            {
                "type": "box_status_changed",
                "box_id": box_id,
                "container_status": "stopped",
                "container_stop_reason": reason,
            }
        )
