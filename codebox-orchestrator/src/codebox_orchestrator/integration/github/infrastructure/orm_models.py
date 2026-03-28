"""GitHub integration ORM models."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from codebox_orchestrator.box.infrastructure.orm_models import Base


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
    box_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("boxes.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
