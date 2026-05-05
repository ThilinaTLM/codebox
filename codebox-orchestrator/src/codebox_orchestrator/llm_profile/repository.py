"""Async repository for LLM profile persistence."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import select

from codebox_orchestrator.llm_profile.models import LLMProfile
from codebox_orchestrator.shared.persistence.repository import SoftDeleteMixin

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import async_sessionmaker


class LLMProfileRepository(SoftDeleteMixin):
    def __init__(self, session_factory: async_sessionmaker) -> None:
        self._session_factory = session_factory

    async def list_by_project(self, project_id: str) -> list[LLMProfile]:
        async with self._session_factory() as session:
            stmt = self.apply_soft_delete_filter(
                select(LLMProfile).where(LLMProfile.project_id == project_id),
                LLMProfile,
            ).order_by(LLMProfile.created_at)
            result = await session.execute(stmt)
            return list(result.scalars().all())

    async def get_by_id(self, profile_id: str) -> LLMProfile | None:
        async with self._session_factory() as session:
            stmt = self.apply_soft_delete_filter(
                select(LLMProfile).where(LLMProfile.id == profile_id),
                LLMProfile,
            )
            result = await session.execute(stmt)
            return result.scalar_one_or_none()

    async def create(
        self,
        *,
        project_id: str,
        name: str,
        provider: str,
        model: str,
        api_key_enc: str,
        base_url: str | None = None,
    ) -> LLMProfile:
        profile = LLMProfile(
            project_id=project_id,
            name=name,
            provider=provider,
            model=model,
            api_key_enc=api_key_enc,
            base_url=base_url,
        )
        async with self._session_factory() as session:
            session.add(profile)
            await session.commit()
            await session.refresh(profile)
            return profile

    async def update(self, profile: LLMProfile) -> LLMProfile:
        profile.updated_at = datetime.now(UTC)
        async with self._session_factory() as session:
            merged = await session.merge(profile)
            await session.commit()
            await session.refresh(merged)
            return merged

    async def delete(self, profile_id: str) -> bool:
        async with self._session_factory() as session:
            stmt = self.apply_soft_delete_filter(
                select(LLMProfile).where(LLMProfile.id == profile_id),
                LLMProfile,
            )
            result = await session.execute(stmt)
            profile = result.scalar_one_or_none()
            if profile is None:
                return False
            self.mark_soft_deleted(profile)
            await session.commit()
            return True

    async def soft_delete_by_project(self, project_id: str) -> int:
        async with self._session_factory() as session:
            stmt = self.apply_soft_delete_filter(
                select(LLMProfile).where(LLMProfile.project_id == project_id),
                LLMProfile,
            )
            result = await session.execute(stmt)
            profiles = list(result.scalars().all())
            for profile in profiles:
                self.mark_soft_deleted(profile)
            await session.commit()
            return len(profiles)
