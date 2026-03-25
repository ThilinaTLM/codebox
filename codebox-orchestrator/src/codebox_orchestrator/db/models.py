"""SQLAlchemy ORM models for the orchestrator."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum as PyEnum

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class TaskStatus(str, PyEnum):
    QUEUED = "queued"
    STARTING = "starting"
    RUNNING = "running"
    WAITING_FOR_FEEDBACK = "waiting_for_feedback"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _new_uuid() -> str:
    return str(uuid.uuid4())


class GitHubInstallation(Base):
    __tablename__ = "github_installations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_uuid)
    installation_id: Mapped[int] = mapped_column(Integer, unique=True, index=True)
    account_login: Mapped[str] = mapped_column(String(255))
    account_type: Mapped[str] = mapped_column(String(50))  # "Organization" or "User"
    settings: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)


class GitHubEvent(Base):
    __tablename__ = "github_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_uuid)
    delivery_id: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    event_type: Mapped[str] = mapped_column(String(100))
    action: Mapped[str] = mapped_column(String(100))
    repository: Mapped[str] = mapped_column(String(255))  # "owner/repo"
    payload: Mapped[str] = mapped_column(Text)  # JSON
    task_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("tasks.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_uuid)
    title: Mapped[str] = mapped_column(String(255))
    prompt: Mapped[str] = mapped_column(Text)
    system_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    model: Mapped[str] = mapped_column(String(255))
    status: Mapped[TaskStatus] = mapped_column(
        Enum(TaskStatus, native_enum=False, length=30),
        default=TaskStatus.QUEUED,
    )

    # Sandbox connection info
    container_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    container_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    callback_token: Mapped[str | None] = mapped_column(String(255), nullable=True)
    session_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    workspace_path: Mapped[str | None] = mapped_column(String(512), nullable=True)

    # Result
    result_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # GitHub integration fields (nullable — only set for GitHub-triggered tasks)
    github_installation_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("github_installations.id"), nullable=True
    )
    github_repo: Mapped[str | None] = mapped_column(String(255), nullable=True)
    github_issue_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    github_trigger_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    github_branch: Mapped[str | None] = mapped_column(String(255), nullable=True)
    github_pr_number: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Relationships
    events: Mapped[list[TaskEvent]] = relationship(
        back_populates="task", cascade="all, delete-orphan", order_by="TaskEvent.id"
    )
    feedback_requests: Mapped[list[FeedbackRequest]] = relationship(
        back_populates="task", cascade="all, delete-orphan"
    )


class SandboxStatus(str, PyEnum):
    STARTING = "starting"
    READY = "ready"
    STOPPED = "stopped"
    FAILED = "failed"


class Sandbox(Base):
    __tablename__ = "sandboxes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_uuid)
    name: Mapped[str] = mapped_column(String(255))
    status: Mapped[SandboxStatus] = mapped_column(
        Enum(SandboxStatus, native_enum=False, length=30),
        default=SandboxStatus.STARTING,
    )

    # Container connection info
    container_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    container_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    callback_token: Mapped[str | None] = mapped_column(String(255), nullable=True)
    session_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    workspace_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    model: Mapped[str] = mapped_column(String(255))

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    stopped_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # Error tracking
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relationships
    events: Mapped[list[SandboxEvent]] = relationship(
        back_populates="sandbox", cascade="all, delete-orphan", order_by="SandboxEvent.id"
    )


class SandboxEvent(Base):
    __tablename__ = "sandbox_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    sandbox_id: Mapped[str] = mapped_column(String(36), ForeignKey("sandboxes.id"))
    event_type: Mapped[str] = mapped_column(String(50))
    data: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)

    sandbox: Mapped[Sandbox] = relationship(back_populates="events")


class TaskEvent(Base):
    __tablename__ = "task_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    task_id: Mapped[str] = mapped_column(String(36), ForeignKey("tasks.id"))
    event_type: Mapped[str] = mapped_column(String(50))
    data: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)

    task: Mapped[Task] = relationship(back_populates="events")


class FeedbackRequest(Base):
    __tablename__ = "feedback_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    task_id: Mapped[str] = mapped_column(String(36), ForeignKey("tasks.id"))
    question: Mapped[str] = mapped_column(Text)
    response: Mapped[str | None] = mapped_column(Text, nullable=True)
    resolved: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    task: Mapped[Task] = relationship(back_populates="feedback_requests")
