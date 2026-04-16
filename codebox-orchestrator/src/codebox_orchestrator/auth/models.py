"""Authentication ORM models."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from enum import StrEnum

from sqlalchemy import DateTime, Index, String, text
from sqlalchemy import Enum as SqlEnum
from sqlalchemy.orm import Mapped, mapped_column

from codebox_orchestrator.shared.persistence.base import Base


class UserStatus(StrEnum):
    ACTIVE = "active"
    DISABLED = "disabled"
    DELETED = "deleted"


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _new_uuid() -> str:
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        Index(
            "uq_users_username_active",
            "username",
            unique=True,
            postgresql_where=text("status != 'deleted'"),
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_uuid)
    username: Mapped[str] = mapped_column(String(255), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(512), nullable=False)
    user_type: Mapped[str] = mapped_column(String(20))  # "admin" | "user"
    status: Mapped[UserStatus] = mapped_column(
        SqlEnum(UserStatus, name="user_status", create_constraint=True),
        default=UserStatus.ACTIVE,
        nullable=False,
    )
    first_name: Mapped[str | None] = mapped_column(String(255), nullable=True, default=None)
    last_name: Mapped[str | None] = mapped_column(String(255), nullable=True, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
