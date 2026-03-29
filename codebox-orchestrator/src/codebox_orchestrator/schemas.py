"""Pydantic schemas for the orchestrator REST API."""

from __future__ import annotations

import contextlib
import json
from typing import TYPE_CHECKING

from pydantic import BaseModel

if TYPE_CHECKING:
    from datetime import datetime

    from codebox_orchestrator.db.models import (
        Activity,
        Box,
        BoxEvent,
        ContainerStatus,
        TaskOutcome,
    )
    from codebox_orchestrator.db.models import (
        BoxMessage as BoxMessageModel,
    )

# ── Request schemas ──────────────────────────────────────────────


class BoxCreate(BaseModel):
    name: str | None = None
    model: str | None = None
    dynamic_system_prompt: str | None = None
    initial_prompt: str | None = None


class BoxMessage(BaseModel):
    message: str


class BoxExec(BaseModel):
    command: str


# ── Response schemas ─────────────────────────────────────────────


class BoxResponse(BaseModel):
    id: str
    name: str
    model: str
    container_status: ContainerStatus
    activity: Activity
    container_stop_reason: str | None
    task_outcome: TaskOutcome | None
    task_outcome_message: str | None
    dynamic_system_prompt: str | None
    initial_prompt: str | None
    container_id: str | None
    container_name: str | None
    session_id: str | None
    workspace_path: str | None
    created_at: datetime
    started_at: datetime | None
    completed_at: datetime | None
    trigger: str | None = None
    # GitHub integration fields
    github_repo: str | None = None
    github_issue_number: int | None = None
    github_trigger_url: str | None = None
    github_branch: str | None = None
    github_pr_number: int | None = None

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_box(cls, box: Box) -> BoxResponse:
        return cls.model_validate(box)


class BoxEventResponse(BaseModel):
    id: int
    box_id: str
    event_type: str
    data: dict | None
    created_at: datetime

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_event(cls, event: BoxEvent) -> BoxEventResponse:
        data = None
        if event.data:
            try:
                data = json.loads(event.data)
            except (json.JSONDecodeError, TypeError):
                data = {"raw": event.data}
        return cls(
            id=event.id,
            box_id=event.box_id,
            event_type=event.event_type,
            data=data,
            created_at=event.created_at,
        )


class BoxMessageResponse(BaseModel):
    id: str
    box_id: str
    seq: int
    role: str
    content: str | None
    tool_calls: list[dict] | None = None
    tool_call_id: str | None = None
    tool_name: str | None = None
    metadata: dict | None = None
    created_at: datetime

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_message(cls, msg: BoxMessageModel) -> BoxMessageResponse:
        tool_calls = None
        if msg.tool_calls:
            with contextlib.suppress(json.JSONDecodeError, TypeError):
                tool_calls = json.loads(msg.tool_calls)
        metadata = None
        if msg.metadata_json:
            with contextlib.suppress(json.JSONDecodeError, TypeError):
                metadata = json.loads(msg.metadata_json)
        return cls(
            id=msg.id,
            box_id=msg.box_id,
            seq=msg.seq,
            role=msg.role,
            content=msg.content,
            tool_calls=tool_calls,
            tool_call_id=msg.tool_call_id,
            tool_name=msg.tool_name,
            metadata=metadata,
            created_at=msg.created_at,
        )


class ContainerResponse(BaseModel):
    id: str
    name: str
    status: str
    image: str
    model: str | None = None
    started_at: str | None = None
    created_at: str | None = None


class ContainerLogsResponse(BaseModel):
    logs: str


# ── GitHub schemas ──────────────────────────────────────────────


class GitHubStatusResponse(BaseModel):
    enabled: bool
    app_slug: str


class GitHubInstallationCreate(BaseModel):
    installation_id: int


class GitHubInstallationResponse(BaseModel):
    id: str
    installation_id: int
    account_login: str
    account_type: str
    created_at: datetime

    model_config = {"from_attributes": True}


class GitHubRepoResponse(BaseModel):
    full_name: str
    private: bool
    default_branch: str
