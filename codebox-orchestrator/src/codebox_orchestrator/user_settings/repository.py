"""Async repository for per-user settings persistence."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import select

from codebox_orchestrator.user_settings.models import UserSettings

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import async_sessionmaker


class UserSettingsRepository:
    def __init__(self, session_factory: async_sessionmaker) -> None:
        self._session_factory = session_factory

    async def get(self, user_id: str) -> UserSettings | None:
        async with self._session_factory() as session:
            return await session.get(UserSettings, user_id)

    async def upsert(self, user_id: str, **fields: object) -> UserSettings:
        """Create or update settings for *user_id*.

        Only the keys present in *fields* are written; other columns are left
        unchanged on update.
        """
        async with self._session_factory() as session:
            settings = await session.get(UserSettings, user_id)
            if settings is None:
                settings = UserSettings(user_id=user_id, **fields)
                session.add(settings)
            else:
                for key, value in fields.items():
                    setattr(settings, key, value)
                settings.updated_at = datetime.now(UTC)
            await session.commit()
            await session.refresh(settings)
            return settings

    async def list_all_with_github(self) -> list[UserSettings]:
        """Return all user settings that have GitHub App configured."""
        async with self._session_factory() as session:
            result = await session.execute(
                select(UserSettings).where(
                    UserSettings.github_app_id.isnot(None),
                    UserSettings.github_app_id != "",
                )
            )
            return list(result.scalars().all())
