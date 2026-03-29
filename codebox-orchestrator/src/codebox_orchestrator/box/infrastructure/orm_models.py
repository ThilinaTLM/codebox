"""SQLAlchemy ORM models for the Box bounded context."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from codebox_orchestrator.box.domain.enums import (
    Activity,
    ContainerStatus,
    TaskOutcome,
)


class Base(DeclarativeBase):
    pass


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _new_uuid() -> str:
    return str(uuid.uuid4())


class Box(Base):
    __tablename__ = "boxes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_uuid)
    name: Mapped[str] = mapped_column(String(255))
    model: Mapped[str] = mapped_column(String(255))
    container_status: Mapped[ContainerStatus] = mapped_column(
        Enum(ContainerStatus, native_enum=False, length=30),
        default=ContainerStatus.STARTING,
    )
    activity: Mapped[Activity] = mapped_column(
        Enum(Activity, native_enum=False, length=30),
        default=Activity.IDLE,
    )
    container_stop_reason: Mapped[str | None] = mapped_column(String(50), nullable=True)
    task_outcome: Mapped[TaskOutcome | None] = mapped_column(
        Enum(TaskOutcome, native_enum=False, length=30), nullable=True
    )
    task_outcome_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Prompts
    dynamic_system_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    initial_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Container connection info
    container_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    container_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    session_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    workspace_path: Mapped[str | None] = mapped_column(String(512), nullable=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # Trigger info
    trigger: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # GitHub integration fields (nullable — only set for GitHub-triggered boxes)
    github_installation_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("github_installations.id"), nullable=True
    )
    github_repo: Mapped[str | None] = mapped_column(String(255), nullable=True)
    github_issue_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    github_trigger_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    github_branch: Mapped[str | None] = mapped_column(String(255), nullable=True)
    github_pr_number: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Relationships
    events: Mapped[list[BoxEvent]] = relationship(
        back_populates="box", cascade="all, delete-orphan", order_by="BoxEvent.id"
    )
    messages: Mapped[list[BoxMessage]] = relationship(
        back_populates="box", cascade="all, delete-orphan", order_by="BoxMessage.seq"
    )
    feedback_requests: Mapped[list[FeedbackRequest]] = relationship(
        back_populates="box", cascade="all, delete-orphan"
    )


class BoxEvent(Base):
    __tablename__ = "box_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    box_id: Mapped[str] = mapped_column(String(36), ForeignKey("boxes.id"))
    event_type: Mapped[str] = mapped_column(String(50))
    data: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)

    box: Mapped[Box] = relationship(back_populates="events")


class BoxMessage(Base):
    """Structured chat message — stores the full thread for a box."""

    __tablename__ = "box_messages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_uuid)
    box_id: Mapped[str] = mapped_column(String(36), ForeignKey("boxes.id"))
    seq: Mapped[int] = mapped_column(Integer)  # ordering within a box
    role: Mapped[str] = mapped_column(String(20))  # system, user, assistant, tool
    content: Mapped[str | None] = mapped_column(Text, nullable=True)
    tool_calls: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON
    tool_call_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    tool_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    metadata_json: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)

    box: Mapped[Box] = relationship(back_populates="messages")


class FeedbackRequest(Base):
    __tablename__ = "feedback_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    box_id: Mapped[str] = mapped_column(String(36), ForeignKey("boxes.id"))
    question: Mapped[str] = mapped_column(Text)
    response: Mapped[str | None] = mapped_column(Text, nullable=True)
    resolved: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    box: Mapped[Box] = relationship(back_populates="feedback_requests")
