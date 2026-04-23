"""Domain views for platform-level (admin) features."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

OrphanReason = Literal["missing", "deleted", "unlabeled"]


@dataclass(frozen=True)
class OrphanContainerView:
    """A sandbox-labelled container with no live Box backing it."""

    container_id: str
    container_name: str
    reason: OrphanReason
    status: str
    image: str
    created_at: str | None
    started_at: str | None
    # Best-effort metadata recovered from container labels.
    # May be empty strings when the container is `unlabeled`.
    box_id: str
    box_name: str
    project_id: str
    trigger: str
