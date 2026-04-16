"""SQLAlchemy ORM model for per-project settings."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from codebox_orchestrator.shared.persistence.base import Base


def _utcnow() -> datetime:
    return datetime.now(UTC)


class ProjectSettings(Base):
    __tablename__ = "project_settings"

    project_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True
    )
    default_llm_profile_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("llm_profiles.id", ondelete="SET NULL"), nullable=True
    )

    # Tavily
    tavily_api_key_enc: Mapped[str | None] = mapped_column(Text, nullable=True)

    # GitHub App configuration
    github_app_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    github_private_key_enc: Mapped[str | None] = mapped_column(Text, nullable=True)
    github_webhook_secret_enc: Mapped[str | None] = mapped_column(Text, nullable=True)
    github_app_slug: Mapped[str | None] = mapped_column(String(255), nullable=True)
    github_bot_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    github_default_base_branch: Mapped[str | None] = mapped_column(
        String(255), nullable=True, default="main"
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False
    )
