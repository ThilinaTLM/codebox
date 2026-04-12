"""Async repository for LLM profile persistence."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import delete, select

from codebox_orchestrator.llm_profile.models import LLMProfile

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import async_sessionmaker


class LLMProfileRepository:
    def __init__(self, session_factory: async_sessionmaker) -> None:
        self._session_factory = session_factory

    async def list_by_user(self, user_id: str) -> list[LLMProfile]:
        async with self._session_factory() as session:
            result = await session.execute(
                select(LLMProfile)
                .where(LLMProfile.user_id == user_id)
                .order_by(LLMProfile.created_at)
            )
            return list(result.scalars().all())

    async def get_by_id(self, profile_id: str) -> LLMProfile | None:
        async with self._session_factory() as session:
            return await session.get(LLMProfile, profile_id)

    async def create(
        self,
        *,
        user_id: str,
        name: str,
        provider: str,
        model: str,
        api_key_enc: str,
        base_url: str | None = None,
    ) -> LLMProfile:
        profile = LLMProfile(
            user_id=user_id,
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
            result = await session.execute(delete(LLMProfile).where(LLMProfile.id == profile_id))
            await session.commit()
            return result.rowcount > 0  # type: ignore[union-attr]
