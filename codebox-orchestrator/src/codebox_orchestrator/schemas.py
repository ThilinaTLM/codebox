"""Pydantic schemas for the orchestrator REST API."""

from __future__ import annotations

import json
from datetime import datetime

from pydantic import BaseModel

from codebox_orchestrator.db.models import (
    Sandbox,
    SandboxEvent,
    SandboxStatus,
    Task,
    TaskEvent,
    TaskStatus,
)


# ── Request schemas ──────────────────────────────────────────────


class TaskCreate(BaseModel):
    title: str
    prompt: str
    model: str | None = None
    system_prompt: str | None = None
    workspace_path: str | None = None


class FeedbackMessage(BaseModel):
    message: str


# ── Response schemas ─────────────────────────────────────────────


class TaskResponse(BaseModel):
    id: str
    title: str
    prompt: str
    system_prompt: str | None
    model: str
    status: TaskStatus
    container_id: str | None
    container_name: str | None
    host_port: int | None
    session_id: str | None
    workspace_path: str | None
    result_summary: str | None
    error_message: str | None
    created_at: datetime
    started_at: datetime | None
    completed_at: datetime | None

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_task(cls, task: Task) -> TaskResponse:
        return cls.model_validate(task)


class TaskEventResponse(BaseModel):
    id: int
    task_id: str
    event_type: str
    data: dict | None
    created_at: datetime

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_event(cls, event: TaskEvent) -> TaskEventResponse:
        data = None
        if event.data:
            try:
                data = json.loads(event.data)
            except (json.JSONDecodeError, TypeError):
                data = {"raw": event.data}
        return cls(
            id=event.id,
            task_id=event.task_id,
            event_type=event.event_type,
            data=data,
            created_at=event.created_at,
        )


class ContainerResponse(BaseModel):
    id: str
    name: str
    port: int | None


# ── Sandbox schemas ─────────────────────────────────────────────


class SandboxCreate(BaseModel):
    name: str | None = None
    model: str | None = None


class SandboxResponse(BaseModel):
    id: str
    name: str
    status: SandboxStatus
    container_id: str | None
    container_name: str | None
    host_port: int | None
    session_id: str | None
    workspace_path: str | None
    model: str
    error_message: str | None
    created_at: datetime
    stopped_at: datetime | None

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_sandbox(cls, sandbox: Sandbox) -> SandboxResponse:
        return cls.model_validate(sandbox)


class SandboxEventResponse(BaseModel):
    id: int
    sandbox_id: str
    event_type: str
    data: dict | None
    created_at: datetime

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_event(cls, event: SandboxEvent) -> SandboxEventResponse:
        data = None
        if event.data:
            try:
                data = json.loads(event.data)
            except (json.JSONDecodeError, TypeError):
                data = {"raw": event.data}
        return cls(
            id=event.id,
            sandbox_id=event.sandbox_id,
            event_type=event.event_type,
            data=data,
            created_at=event.created_at,
        )
