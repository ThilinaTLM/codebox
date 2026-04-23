"""SQLAlchemy ORM models for automations, their runs, and the scheduler lock."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from codebox_orchestrator.shared.persistence.base import Base


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _new_uuid() -> str:
    return str(uuid.uuid4())


class Automation(Base):
    """A project-scoped rule mapping a trigger to a box spawn."""

    __tablename__ = "automations"
    __table_args__ = (
        UniqueConstraint("project_id", "name", name="uq_automations_project_name"),
        Index("ix_automations_project_enabled", "project_id", "enabled"),
        Index("ix_automations_trigger_kind", "project_id", "trigger_kind"),
        Index("ix_automations_next_run_at", "next_run_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_uuid)
    project_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # Trigger ----------------------------------------------------------------
    trigger_kind: Mapped[str] = mapped_column(String(32), nullable=False)
    trigger_filters: Mapped[list | None] = mapped_column(JSON, nullable=True)
    schedule_cron: Mapped[str | None] = mapped_column(String(64), nullable=True)
    schedule_timezone: Mapped[str | None] = mapped_column(String(64), nullable=True)
    next_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Workspace --------------------------------------------------------------
    workspace_mode: Mapped[str] = mapped_column(String(32), nullable=False)
    pinned_repo: Mapped[str | None] = mapped_column(String(255), nullable=True)
    pinned_branch: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Prompts ----------------------------------------------------------------
    system_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    initial_prompt: Mapped[str] = mapped_column(Text, nullable=False)

    # Agent config overrides -------------------------------------------------
    llm_profile_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("llm_profiles.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Audit ------------------------------------------------------------------
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False
    )
    created_by: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )


class AutomationRun(Base):
    """A record of a trigger firing against an automation — 0..N boxes per event."""

    __tablename__ = "automation_runs"
    __table_args__ = (
        Index("ix_automation_runs_automation", "automation_id", "created_at"),
        Index("ix_automation_runs_event", "github_event_id"),
        Index("ix_automation_runs_project", "project_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_uuid)
    project_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
    )
    automation_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("automations.id", ondelete="CASCADE"),
        nullable=False,
    )
    box_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("boxes.id", ondelete="SET NULL"),
        nullable=True,
    )
    github_event_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("github_events.id", ondelete="SET NULL"),
        nullable=True,
    )
    trigger_kind: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    # "spawned" | "skipped_filter" | "error"
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )


class SchedulerLock(Base):
    """Leader-election row for the automation scheduler across replicas."""

    __tablename__ = "scheduler_locks"

    name: Mapped[str] = mapped_column(String(64), primary_key=True)
    holder: Mapped[str | None] = mapped_column(String(64), nullable=True)
    acquired_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    heartbeat_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
