"""Pydantic schemas for the orchestrator REST API.

Mirrors the original schemas.py but works with domain entity dataclasses
instead of ORM models.  Pydantic's ``from_attributes=True`` handles both.
"""

from __future__ import annotations

import json
from datetime import datetime

from pydantic import BaseModel

from codebox_orchestrator.box.domain.enums import (
    AgentReportStatus,
    ContainerStatus,
    TaskStatus,
)
from codebox_orchestrator.box.domain.entities import (
    Box,
    BoxEvent,
    BoxMessage as BoxMessageEntity,
)


# ── Request schemas ──────────────────────────────────────────────


class BoxCreate(BaseModel):
    name: str | None = None
    model: str | None = None
    system_prompt: str | None = None
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
    task_status: TaskStatus
    stop_reason: str | None
    agent_report_status: AgentReportStatus | None
    agent_report_message: str | None
    system_prompt: str | None
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
    def from_entity(cls, box: Box) -> BoxResponse:
        return cls.model_validate(box)


class BoxEventResponse(BaseModel):
    id: int
    box_id: str
    event_type: str
    data: dict | None
    created_at: datetime

    model_config = {"from_attributes": True}

    @classmethod
    def from_entity(cls, event: BoxEvent) -> BoxEventResponse:
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
    def from_entity(cls, msg: BoxMessageEntity) -> BoxMessageResponse:
        tool_calls = None
        if msg.tool_calls:
            try:
                tool_calls = json.loads(msg.tool_calls)
            except (json.JSONDecodeError, TypeError):
                pass
        metadata = None
        if msg.metadata_json:
            try:
                metadata = json.loads(msg.metadata_json)
            except (json.JSONDecodeError, TypeError):
                pass
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
