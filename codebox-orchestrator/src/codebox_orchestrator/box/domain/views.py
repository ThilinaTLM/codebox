"""Read-only view models for box data."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class BoxView:
    """Read-only snapshot of a box, assembled from persisted metadata + Docker + gRPC."""

    id: str
    name: str
    provider: str
    model: str
    container_status: str  # Docker status: "running", "exited", "created", "starting"
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
