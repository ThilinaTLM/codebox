"""Pydantic schemas for the orchestrator REST API."""

from __future__ import annotations

from typing import TYPE_CHECKING

from pydantic import BaseModel

if TYPE_CHECKING:
    from codebox_orchestrator.box.domain.views import BoxView

# ── Request schemas ──────────────────────────────────────────────


class BoxCreate(BaseModel):
    name: str | None = None
    provider: str | None = None
    model: str | None = None
    dynamic_system_prompt: str | None = None
    initial_prompt: str | None = None
    github_repo: str | None = None


class BoxMessage(BaseModel):
    message: str


class BoxExec(BaseModel):
    command: str


# ── Response schemas ─────────────────────────────────────────────


class BoxResponse(BaseModel):
    id: str
    name: str
    provider: str
    model: str
    container_status: str
    container_id: str
    container_name: str
    grpc_connected: bool
    activity: str | None = None
    task_outcome: str | None = None
    task_outcome_message: str | None = None
    trigger: str | None = None
    github_repo: str | None = None
    github_branch: str | None = None
    github_issue_number: int | None = None
    created_at: str | None = None
    started_at: str | None = None
    image: str = ""

    @classmethod
    def from_view(cls, view: BoxView) -> BoxResponse:
        return cls(
            id=view.id,
            name=view.name,
            provider=view.provider,
            model=view.model,
            container_status=view.container_status,
            container_id=view.container_id,
            container_name=view.container_name,
            grpc_connected=view.grpc_connected,
            activity=view.activity,
            task_outcome=view.task_outcome,
            task_outcome_message=view.task_outcome_message,
            trigger=view.trigger,
            github_repo=view.github_repo,
            github_branch=view.github_branch,
            github_issue_number=view.github_issue_number,
            created_at=view.created_at,
            started_at=view.started_at,
            image=view.image,
        )


class BoxMessageResponse(BaseModel):
    role: str
    content: str | None = None
    tool_calls: list[dict] | None = None
    tool_call_id: str | None = None
    tool_name: str | None = None
    metadata_json: str | None = None


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
    created_at: str

    model_config = {"from_attributes": True}


class GitHubRepoResponse(BaseModel):
    full_name: str
    private: bool
    default_branch: str


class ModelResponse(BaseModel):
    provider: str
    id: str
    name: str
