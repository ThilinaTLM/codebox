"""Box domain events."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class BoxCreated:
    box_id: str
    name: str
    model: str


@dataclass(frozen=True)
class BoxStatusChanged:
    box_id: str
    container_status: str | None = None
    task_status: str | None = None
    agent_report_status: str | None = None
    stop_reason: str | None = None


@dataclass(frozen=True)
class BoxDeleted:
    box_id: str
