"""Pydantic schemas for the orchestrator REST API."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any, Literal

from pydantic import BaseModel

if TYPE_CHECKING:
    from codebox_orchestrator.box.domain.views import BoxView


class ErrorResponse(BaseModel):
    error: str
    message: str
    details: dict[str, Any] | None = None


# ── Request schemas ──────────────────────────────────────────────


class ToolSettings(BaseModel):
    """Per-tool configuration overrides.

    Each tool accepts a dict with ``enabled`` (bool) and tool-specific keys.
    Only include tools you want to override — omitted tools keep defaults.
    """

    execute: dict[str, Any] | None = None
    web_search: dict[str, Any] | None = None
    web_fetch: dict[str, Any] | None = None
    filesystem: dict[str, Any] | None = None
    write_todos: dict[str, Any] | None = None
    task: dict[str, Any] | None = None
    compact_conversation: dict[str, Any] | None = None


class BoxCreate(BaseModel):
    """Payload for ``POST /api/projects/{slug}/boxes``."""

    name: str | None = None
    description: str | None = None
    tags: list[str] | None = None
    llm_profile_id: str | None = None
    system_prompt: str | None = None
    auto_start_prompt: str | None = None
    recursion_limit: int | None = None
    tools: ToolSettings | None = None
    github_repo: str | None = None
    init_bash_script: str | None = None


class BoxUpdateRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    tags: list[str] | None = None


class BoxMessage(BaseModel):
    message: str


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
    project_id: str = ""
    activity: str | None = None
    box_outcome: str | None = None
    box_outcome_message: str | None = None
    trigger: str | None = None
    description: str | None = None
    tags: list[str] | None = None
    github_repo: str | None = None
    github_branch: str | None = None
    github_issue_number: int | None = None
    created_at: str | None = None
    started_at: str | None = None
    image: str = ""
    error_detail: str | None = None

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
            project_id=view.project_id,
            activity=view.activity,
            box_outcome=view.box_outcome,
            box_outcome_message=view.box_outcome_message,
            trigger=view.trigger,
            description=view.description,
            tags=view.tags,
            github_repo=view.github_repo,
            github_branch=view.github_branch,
            github_issue_number=view.github_issue_number,
            created_at=view.created_at,
            started_at=view.started_at,
            image=view.image,
            error_detail=view.error_detail,
        )


class BoxEventResponse(BaseModel):
    seq: int
    event_id: str
    timestamp_ms: int
    kind: str
    run_id: str = ""
    turn_id: str = ""
    message_id: str = ""
    tool_call_id: str = ""
    command_id: str = ""
    payload: dict[str, Any]


class BoxEventPage(BaseModel):
    items: list[BoxEventResponse]
    next_cursor: str | None = None


# ── GitHub schemas ──────────────────────────────────────────────


class GitHubStatusResponse(BaseModel):
    enabled: bool
    app_slug: str | None = None
    webhook_url: str | None = None
    public_url: str | None = None
    manifest_supported: bool = False


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


class GitHubBranchResponse(BaseModel):
    name: str
    protected: bool


class GitHubEventResponse(BaseModel):
    id: str
    delivery_id: str
    event_type: str
    action: str | None = None
    repository: str | None = None
    created_at: datetime


class GitHubEventListResponse(BaseModel):
    items: list[GitHubEventResponse]
    next_cursor: str | None = None


class ModelResponse(BaseModel):
    provider: str
    id: str
    name: str


# ── LLM Profile schemas ─────────────────────────────────────────


class ModelsPreviewRequest(BaseModel):
    provider: str
    api_key: str
    base_url: str | None = None


class LLMProfileCreate(BaseModel):
    name: str
    provider: str
    model: str
    api_key: str
    base_url: str | None = None


class LLMProfileUpdate(BaseModel):
    name: str | None = None
    provider: str | None = None
    model: str | None = None
    api_key: str | None = None
    base_url: str | None = None


class LLMProfileResponse(BaseModel):
    id: str
    name: str
    provider: str
    model: str
    api_key_masked: str
    base_url: str | None = None
    is_default: bool = False
    created_at: str
    updated_at: str


# ── LLM Profile export / import schemas ──────────────────────────


class LLMProfileExportRequest(BaseModel):
    """Request body for ``POST /api/llm-profiles/export``."""

    profile_ids: list[str] | None = None
    key_mode: Literal["no_keys", "plaintext", "password_encrypted"] = "no_keys"
    password: str | None = None


class LLMProfileExportedEntry(BaseModel):
    """Single profile inside the export file."""

    name: str
    provider: str
    model: str
    api_key: str | None = None
    base_url: str | None = None


class LLMProfileExportFile(BaseModel):
    """Top-level export file structure."""

    version: int = 1
    exported_at: str
    key_mode: str
    key_params: dict[str, Any] | None = None
    profiles: list[LLMProfileExportedEntry]


class LLMProfileImportRequest(BaseModel):
    """Request body for ``POST /api/llm-profiles/import``."""

    file: LLMProfileExportFile
    password: str | None = None


class LLMProfileImportResult(BaseModel):
    """Response from ``POST /api/llm-profiles/import``."""

    imported: int
    skipped: int
    profiles: list[LLMProfileResponse]


# ── Project schemas ─────────────────────────────────────────────


class ProjectCreate(BaseModel):
    name: str
    description: str | None = None


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class ProjectResponse(BaseModel):
    id: str
    name: str
    slug: str
    description: str | None = None
    created_by: str
    status: str
    created_at: str
    updated_at: str


class ProjectMemberCreate(BaseModel):
    user_id: str
    role: str = "contributor"


class ProjectMemberUpdate(BaseModel):
    role: str


class ProjectUserSummary(BaseModel):
    """Lightweight user identity used for member rows and member-candidate search."""

    id: str
    username: str
    first_name: str | None = None
    last_name: str | None = None
    status: str


class ProjectMemberResponse(BaseModel):
    id: str
    project_id: str
    user_id: str
    role: str
    created_at: str
    user: ProjectUserSummary


# ── Project Settings schemas ────────────────────────────────────


class ProjectSettingsResponse(BaseModel):
    default_llm_profile_id: str | None = None
    tavily_api_key_masked: str | None = None
    github_app_id: str | None = None
    github_private_key_masked: str | None = None
    github_webhook_secret_masked: str | None = None
    github_app_slug: str | None = None
    github_bot_name: str | None = None
    github_default_base_branch: str | None = None


class ProjectSettingsUpdate(BaseModel):
    default_llm_profile_id: str | None = None
    tavily_api_key: str | None = None
    github_app_id: str | None = None
    github_private_key: str | None = None
    github_webhook_secret: str | None = None
    github_app_slug: str | None = None
    github_bot_name: str | None = None
    github_default_base_branch: str | None = None
