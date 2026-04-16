"""Async repository for per-project settings persistence."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import select

from codebox_orchestrator.project_settings.models import ProjectSettings

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import async_sessionmaker


class ProjectSettingsRepository:
    def __init__(self, session_factory: async_sessionmaker) -> None:
        self._session_factory = session_factory

    async def get(self, project_id: str) -> ProjectSettings | None:
        async with self._session_factory() as session:
            return await session.get(ProjectSettings, project_id)

    async def upsert(self, project_id: str, **fields: object) -> ProjectSettings:
        """Create or update settings for *project_id*.

        Only the keys present in *fields* are written; other columns are left
        unchanged on update.
        """
        async with self._session_factory() as session:
            settings = await session.get(ProjectSettings, project_id)
            if settings is None:
                settings = ProjectSettings(project_id=project_id, **fields)
                session.add(settings)
            else:
                for key, value in fields.items():
                    setattr(settings, key, value)
                settings.updated_at = datetime.now(UTC)
            await session.commit()
            await session.refresh(settings)
            return settings

    async def list_all_with_github(self) -> list[ProjectSettings]:
        """Return all project settings that have GitHub App configured."""
        async with self._session_factory() as session:
            result = await session.execute(
                select(ProjectSettings).where(
                    ProjectSettings.github_app_id.isnot(None),
                    ProjectSettings.github_app_id != "",
                )
            )
            return list(result.scalars().all())
