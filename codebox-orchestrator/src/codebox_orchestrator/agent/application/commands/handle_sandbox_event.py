"""Handle box event command handler.

Processes canonical stream events from box containers, persists them,
updates live projections, and broadcasts them via SSE.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from codebox_orchestrator.agent.infrastructure.grpc.generated.codebox.box import (
    box_pb2,  # noqa: TC001
)
from codebox_orchestrator.agent.infrastructure.grpc.sse_convert import stream_event_to_dict

if TYPE_CHECKING:
    from codebox_orchestrator.agent.infrastructure.callback_registry import CallbackRegistry
    from codebox_orchestrator.agent.infrastructure.event_repository import (
        SqlAlchemyBoxEventRepository,
    )
    from codebox_orchestrator.box.ports.event_publisher import EventPublisher

logger = logging.getLogger(__name__)


class HandleBoxEventHandler:
    """Processes a single event from a box container."""

    def __init__(
        self,
        publisher: EventPublisher,
        registry: CallbackRegistry,
        repository: SqlAlchemyBoxEventRepository,
    ) -> None:
        self._publisher = publisher
        self._registry = registry
        self._repository = repository

    async def execute(self, box_id: str, event: box_pb2.BoxEvent) -> None:
        field = event.WhichOneof("event")
        if not field:
            return

        if field == "query_result":
            qr = event.query_result
            self._registry.resolve_pending_request(box_id, qr.request_id, qr)
            return

        if field == "stream_event":
            raw = stream_event_to_dict(event.stream_event)
            stored = await self._repository.append_event(box_id, raw)
            await self._apply_live_state(box_id, stored)
            await self._publisher.publish_box_event(box_id, stored)
            return

    async def _apply_live_state(self, box_id: str, event: dict) -> None:
        kind = event.get("kind", "")
        payload = event.get("payload", {}) or {}
        if kind == "state.changed":
            status = payload.get("activity", "")
            if status:
                self._registry.update_live_state(box_id, "activity", status)
                await self._publisher.publish_global_event(
                    {"type": "box_status_changed", "box_id": box_id, "activity": status}
                )
        elif kind == "outcome.declared":
            status = payload.get("status", "")
            message = payload.get("message", "")
            self._registry.update_live_state(box_id, "task_outcome", status)
            self._registry.update_live_state(box_id, "task_outcome_message", message)
            await self._publisher.publish_global_event(
                {
                    "type": "box_status_changed",
                    "box_id": box_id,
                    "task_outcome": status,
                    "task_outcome_message": message,
                }
            )
        elif kind == "run.failed":
            message = payload.get("error", "")
            self._registry.update_live_state(box_id, "task_outcome", "unable_to_proceed")
            self._registry.update_live_state(box_id, "task_outcome_message", message)
            await self._publisher.publish_global_event(
                {
                    "type": "box_status_changed",
                    "box_id": box_id,
                    "task_outcome": "unable_to_proceed",
                    "task_outcome_message": message,
                }
            )

    async def set_container_stopped(self, box_id: str, reason: str) -> None:
        self._registry.update_live_state(box_id, "activity", "idle")
        await self._publisher.publish_global_event(
            {
                "type": "box_status_changed",
                "box_id": box_id,
                "container_status": "stopped",
                "container_stop_reason": reason,
            }
        )
