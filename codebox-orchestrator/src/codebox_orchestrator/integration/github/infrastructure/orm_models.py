"""GitHub integration ORM models."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _new_uuid() -> str:
    return str(uuid.uuid4())


class GitHubInstallation(Base):
    __tablename__ = "github_installations"
    __table_args__ = (
        UniqueConstraint("user_id", "installation_id", name="uq_gh_inst_user_install"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_uuid)
    user_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    installation_id: Mapped[int] = mapped_column(Integer, index=True)
    account_login: Mapped[str] = mapped_column(String(255))
    account_type: Mapped[str] = mapped_column(String(50))  # "Organization" or "User"
    settings: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)


class GitHubEvent(Base):
    __tablename__ = "github_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_uuid)
    user_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    delivery_id: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    event_type: Mapped[str] = mapped_column(String(100))
    action: Mapped[str] = mapped_column(String(100))
    repository: Mapped[str] = mapped_column(String(255))  # "owner/repo"
    payload: Mapped[str] = mapped_column(Text)  # JSON
    box_id: Mapped[str | None] = mapped_column(String(36), nullable=True)  # box UUID (no FK)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
