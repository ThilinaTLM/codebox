"""Handle sandbox event command handler.

Processes events from sandbox containers, consolidating the logic
previously duplicated between BoxService and SandboxServiceServicer.
"""

from __future__ import annotations

import json
import logging
from typing import TYPE_CHECKING, Any

from codebox_orchestrator.box.domain.entities import BoxMessage
from codebox_orchestrator.box.domain.enums import (
    Activity,
    ContainerStatus,
    TaskOutcome,
)

if TYPE_CHECKING:
    from codebox_orchestrator.agent.infrastructure.callback_registry import CallbackRegistry
    from codebox_orchestrator.box.ports.box_repository import BoxRepository
    from codebox_orchestrator.box.ports.event_publisher import EventPublisher

logger = logging.getLogger(__name__)


class HandleSandboxEventHandler:
    """Processes a single event from a sandbox container."""

    def __init__(
        self,
        repo: BoxRepository,
        publisher: EventPublisher,
        registry: CallbackRegistry,
    ) -> None:
        self._repo = repo
        self._publisher = publisher
        self._registry = registry

    async def execute(self, box_id: str, event_type: str, event_dict: dict[str, Any]) -> None:
        """Process a single sandbox event."""
        if not event_type:
            return

        # Handle file-op responses (resolve pending futures)
        if event_type in ("list_files_result", "read_file_result"):
            request_id = event_dict.get("request_id", "")
            self._registry.resolve_pending_request(box_id, request_id, event_dict)
            return

        # Resolve exec_done pending requests
        if event_type == "exec_done":
            request_id = event_dict.get("request_id", "")
            if request_id:
                self._registry.resolve_pending_request(box_id, request_id, event_dict)

        # Persist structured message
        if event_type == "message_complete":
            msg_data = event_dict.get("message", {})
            await self._persist_message(box_id, msg_data)

        # Handle activity changes
        if event_type == "activity_changed":
            status = event_dict.get("status", "")
            await self._set_activity(box_id, status)

        # Handle task outcome
        elif event_type == "task_outcome":
            status = event_dict.get("status", "")
            message = event_dict.get("message", "")
            await self._set_task_outcome(box_id, status, message)

        # Broadcast to subscribers
        await self._publisher.publish_box_event(box_id, event_dict)

    async def set_container_stopped(self, box_id: str, reason: str) -> None:
        """Mark container as stopped (called on gRPC disconnect)."""
        box = await self._repo.get(box_id)
        if box and box.container_status != ContainerStatus.STOPPED:
            box.stop(reason)
            await self._repo.save(box)
            await self._publisher.publish_box_event(
                box_id,
                {
                    "type": "status_change",
                    "container_status": ContainerStatus.STOPPED.value,
                    "container_stop_reason": reason,
                },
            )
            await self._publisher.publish_global_event(
                {
                    "type": "box_status_changed",
                    "box_id": box_id,
                    "container_status": ContainerStatus.STOPPED.value,
                    "container_stop_reason": reason,
                }
            )

    async def set_container_stopped_if_running(self, box_id: str, reason: str) -> None:
        """Mark as stopped only if currently running."""
        box = await self._repo.get(box_id)
        if box and box.container_status == ContainerStatus.RUNNING:
            await self.set_container_stopped(box_id, reason)

    async def _persist_message(self, box_id: str, msg_data: dict[str, Any]) -> None:
        tool_calls = msg_data.get("tool_calls")
        tool_calls_json = json.dumps(tool_calls) if tool_calls else None

        msg = BoxMessage(
            box_id=box_id,
            seq=0,  # auto-assigned by repository
            role=msg_data.get("role", ""),
            content=msg_data.get("content"),
            tool_calls=tool_calls_json,
            tool_call_id=msg_data.get("tool_call_id"),
            tool_name=msg_data.get("tool_name"),
            metadata_json=msg_data.get("metadata_json"),
        )
        await self._repo.add_message(box_id, msg)

    async def _set_activity(self, box_id: str, status: str) -> None:
        try:
            act = Activity(status)
        except ValueError:
            logger.warning("Invalid activity: %s", status)
            return
        box = await self._repo.get(box_id)
        if box:
            box.activity = act
            await self._repo.save(box)
        await self._publisher.publish_box_event(
            box_id, {"type": "status_change", "activity": act.value}
        )
        await self._publisher.publish_global_event(
            {
                "type": "box_status_changed",
                "box_id": box_id,
                "activity": act.value,
            }
        )

    async def _set_task_outcome(self, box_id: str, status: str, message: str) -> None:
        try:
            outcome = TaskOutcome(status)
        except ValueError:
            logger.warning("Invalid task outcome: %s", status)
            return
        box = await self._repo.get(box_id)
        if box:
            box.task_outcome = outcome
            box.task_outcome_message = message or None
            await self._repo.save(box)
        await self._publisher.publish_box_event(
            box_id,
            {
                "type": "status_change",
                "task_outcome": outcome.value,
                "task_outcome_message": message,
            },
        )
        await self._publisher.publish_global_event(
            {
                "type": "box_status_changed",
                "box_id": box_id,
                "task_outcome": outcome.value,
            }
        )
