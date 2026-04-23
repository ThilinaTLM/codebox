"""Pydantic schemas for the automation service and API boundary."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

# --- Supported trigger kinds ---------------------------------------------

TriggerKind = Literal[
    "github.issues",
    "github.issue_comment",
    "github.pull_request",
    "github.pull_request_review",
    "github.pull_request_review_comment",
    "github.push",
    "schedule",
]

WorkspaceMode = Literal["branch_from_issue", "checkout_ref", "pinned"]

FilterOp = Literal["eq", "in", "contains_any", "matches"]

RunStatus = Literal["spawned", "skipped_filter", "error"]

GITHUB_TRIGGER_KINDS: tuple[str, ...] = (
    "github.issues",
    "github.issue_comment",
    "github.pull_request",
    "github.pull_request_review",
    "github.pull_request_review_comment",
    "github.push",
)


# --- Filter predicates ---------------------------------------------------


class TriggerFilterPredicate(BaseModel):
    """A single predicate evaluated against the TemplateContext."""

    field: str = Field(..., min_length=1, max_length=64)
    op: FilterOp
    value: str | list[str]


# --- Create / Update / Response ------------------------------------------


class AutomationCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=2048)
    enabled: bool = True
    trigger_kind: TriggerKind
    trigger_filters: list[TriggerFilterPredicate] | None = None
    schedule_cron: str | None = Field(default=None, max_length=64)
    schedule_timezone: str | None = Field(default="UTC", max_length=64)
    workspace_mode: WorkspaceMode
    pinned_repo: str | None = Field(default=None, max_length=255)
    pinned_branch: str | None = Field(default=None, max_length=255)
    system_prompt: str | None = Field(default=None, max_length=16 * 1024)
    initial_prompt: str = Field(..., min_length=1, max_length=50 * 1024)
    llm_profile_id: str | None = Field(default=None, max_length=36)


class AutomationUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=2048)
    enabled: bool | None = None
    trigger_kind: TriggerKind | None = None
    trigger_filters: list[TriggerFilterPredicate] | None = None
    schedule_cron: str | None = Field(default=None, max_length=64)
    schedule_timezone: str | None = Field(default=None, max_length=64)
    workspace_mode: WorkspaceMode | None = None
    pinned_repo: str | None = Field(default=None, max_length=255)
    pinned_branch: str | None = Field(default=None, max_length=255)
    system_prompt: str | None = Field(default=None, max_length=16 * 1024)
    initial_prompt: str | None = Field(default=None, min_length=1, max_length=50 * 1024)
    llm_profile_id: str | None = Field(default=None, max_length=36)


class AutomationResponse(BaseModel):
    id: str
    project_id: str
    name: str
    description: str | None = None
    enabled: bool
    trigger_kind: str
    trigger_filters: list[TriggerFilterPredicate] | None = None
    schedule_cron: str | None = None
    schedule_timezone: str | None = None
    next_run_at: datetime | None = None
    workspace_mode: str
    pinned_repo: str | None = None
    pinned_branch: str | None = None
    system_prompt: str | None = None
    initial_prompt: str
    llm_profile_id: str | None = None
    created_at: datetime
    updated_at: datetime
    created_by: str | None = None


class AutomationListResponse(BaseModel):
    automations: list[AutomationResponse]


class AutomationRunResponse(BaseModel):
    id: str
    project_id: str
    automation_id: str
    box_id: str | None = None
    github_event_id: str | None = None
    trigger_kind: str
    status: str
    error: str | None = None
    created_at: datetime


class AutomationRunListResponse(BaseModel):
    runs: list[AutomationRunResponse]
    next_cursor: str | None = None


# --- Dry-run --------------------------------------------------------------


class AutomationDryRunRequest(BaseModel):
    """Dry-run against a synthetic event.

    Either ``schedule=True`` or (``event_type`` + ``payload``) must be set.
    """

    event_type: str | None = None
    payload: dict[str, Any] | None = None
    schedule: bool = False


class AutomationDryRunResponse(BaseModel):
    matched: bool
    reason: str | None = None
    rendered_system_prompt: str | None = None
    rendered_initial_prompt: str | None = None
    setup_commands: list[str] = Field(default_factory=list)
    unresolved_variables: list[str] = Field(default_factory=list)
