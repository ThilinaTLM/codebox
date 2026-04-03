"""Handle sandbox event command handler.

Processes events from sandbox containers. The orchestrator no longer
persists messages or state to its database — it just caches live state
in the CallbackRegistry and broadcasts events via SSE.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from codebox_orchestrator.agent.infrastructure.callback_registry import CallbackRegistry
    from codebox_orchestrator.box.ports.event_publisher import EventPublisher

logger = logging.getLogger(__name__)


class HandleSandboxEventHandler:
    """Processes a single event from a sandbox container."""

    def __init__(
        self,
        publisher: EventPublisher,
        registry: CallbackRegistry,
    ) -> None:
        self._publisher = publisher
        self._registry = registry

    async def execute(self, box_id: str, event_type: str, event_dict: dict[str, Any]) -> None:
        """Process a single sandbox event."""
        if not event_type:
            return

        # Handle file-op / exec responses (resolve pending futures)
        if event_type in (
            "list_files_result",
            "read_file_result",
            "get_messages_result",
            "get_box_state_result",
        ):
            request_id = event_dict.get("request_id", "")
            self._registry.resolve_pending_request(box_id, request_id, event_dict)
            return

        if event_type == "exec_done":
            request_id = event_dict.get("request_id", "")
            if request_id:
                self._registry.resolve_pending_request(box_id, request_id, event_dict)

        # Cache activity changes in registry
        if event_type == "activity_changed":
            status = event_dict.get("status", "")
            self._registry.update_live_state(box_id, "activity", status)
            await self._publisher.publish_box_event(
                box_id, {"type": "status_change", "activity": status}
            )
            await self._publisher.publish_global_event(
                {"type": "box_status_changed", "box_id": box_id, "activity": status}
            )

        # Cache task outcome in registry
        elif event_type == "task_outcome":
            status = event_dict.get("status", "")
            message = event_dict.get("message", "")
            self._registry.update_live_state(box_id, "task_outcome", status)
            self._registry.update_live_state(box_id, "task_outcome_message", message)
            await self._publisher.publish_box_event(
                box_id,
                {"type": "status_change", "task_outcome": status, "task_outcome_message": message},
            )
            await self._publisher.publish_global_event(
                {"type": "box_status_changed", "box_id": box_id, "task_outcome": status}
            )

        # Broadcast all events to SSE subscribers
        await self._publisher.publish_box_event(box_id, event_dict)

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
