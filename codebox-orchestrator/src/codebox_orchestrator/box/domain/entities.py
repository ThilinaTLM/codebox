"""Box domain entities — pure Python dataclasses."""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone

from codebox_orchestrator.box.domain.enums import (
    Activity,
    ContainerStatus,
    TaskOutcome,
)


def _new_uuid() -> str:
    return str(uuid.uuid4())


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class Box:
    name: str
    model: str

    id: str = field(default_factory=_new_uuid)
    container_status: ContainerStatus = ContainerStatus.STARTING
    activity: Activity = Activity.IDLE
    container_stop_reason: str | None = None
    task_outcome: TaskOutcome | None = None
    task_outcome_message: str | None = None

    # Prompts
    dynamic_system_prompt: str | None = None
    initial_prompt: str | None = None

    # Container connection info
    container_id: str | None = None
    container_name: str | None = None
    session_id: str | None = None
    workspace_path: str | None = None

    # Timestamps
    created_at: datetime = field(default_factory=_utcnow)
    started_at: datetime | None = None
    completed_at: datetime | None = None

    # Trigger info
    trigger: str | None = None

    # GitHub integration fields
    github_installation_id: str | None = None
    github_repo: str | None = None
    github_issue_number: int | None = None
    github_trigger_url: str | None = None
    github_branch: str | None = None
    github_pr_number: int | None = None

    # -- State transition methods --

    def stop(self, reason: str) -> None:
        """Transition to STOPPED state."""
        self.container_status = ContainerStatus.STOPPED
        self.activity = Activity.IDLE
        self.container_stop_reason = reason
        self.completed_at = datetime.now(timezone.utc)

    def mark_running(self) -> None:
        """Transition to RUNNING state."""
        self.container_status = ContainerStatus.RUNNING

    def mark_starting(self) -> None:
        """Transition to STARTING state (e.g. on restart)."""
        self.container_status = ContainerStatus.STARTING
        self.container_stop_reason = None
        self.started_at = datetime.now(timezone.utc)
        self.completed_at = None


@dataclass
class BoxEvent:
    box_id: str
    event_type: str
    data: str

    id: int = 0
    created_at: datetime = field(default_factory=_utcnow)


@dataclass
class BoxMessage:
    box_id: str
    seq: int
    role: str

    id: str = field(default_factory=_new_uuid)
    content: str | None = None
    tool_calls: str | None = None
    tool_call_id: str | None = None
    tool_name: str | None = None
    metadata_json: str | None = None
    created_at: datetime = field(default_factory=_utcnow)


@dataclass
class FeedbackRequest:
    box_id: str
    question: str

    id: str = field(default_factory=_new_uuid)
    response: str | None = None
    resolved: bool = False
    created_at: datetime = field(default_factory=_utcnow)
    resolved_at: datetime | None = None
