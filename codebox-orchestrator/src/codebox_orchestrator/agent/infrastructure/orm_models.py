"""ORM models for persisted Box event history and projections."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import BigInteger, DateTime, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _new_uuid() -> str:
    return str(uuid.uuid4())


class BoxEventRecord(Base):
    __tablename__ = "box_events"
    __table_args__ = (UniqueConstraint("box_id", "seq", name="uq_box_events_box_seq"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_uuid)
    box_id: Mapped[str] = mapped_column(String(36), index=True)
    seq: Mapped[int] = mapped_column(Integer)
    kind: Mapped[str] = mapped_column(String(120), index=True)
    event_id: Mapped[str] = mapped_column(String(80), index=True)
    timestamp_ms: Mapped[int] = mapped_column(BigInteger)
    run_id: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    turn_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    message_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    tool_call_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    command_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    payload_json: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)


class BoxProjectionRecord(Base):
    __tablename__ = "box_projections"

    box_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    last_seq: Mapped[int] = mapped_column(Integer, default=0)
    activity: Mapped[str | None] = mapped_column(String(80), nullable=True)
    task_outcome: Mapped[str | None] = mapped_column(String(80), nullable=True)
    task_outcome_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, onupdate=_utcnow)
