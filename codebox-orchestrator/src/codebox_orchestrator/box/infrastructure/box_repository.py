"""Repository for persisted box metadata."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import select

from codebox_orchestrator.box.infrastructure.orm_models import BoxRecord

if TYPE_CHECKING:
    from collections.abc import Iterable

    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker


class BoxRepository:
    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory

    async def create(
        self,
        *,
        box_id: str,
        project_id: str,
        created_by: str | None,
        name: str,
        description: str | None,
        tags: list[str] | None,
        provider: str,
        model: str,
        trigger: str | None,
        github_repo: str | None,
        github_branch: str | None,
        github_issue_number: int | None,
    ) -> BoxRecord:
        record = BoxRecord(
            id=box_id,
            project_id=project_id,
            created_by=created_by,
            name=name,
            description=description,
            tags_json=json.dumps(tags or []),
            provider=provider,
            model=model,
            trigger=trigger,
            github_repo=github_repo,
            github_branch=github_branch,
            github_issue_number=github_issue_number,
        )
        async with self._session_factory() as session:
            session.add(record)
            await session.commit()
            await session.refresh(record)
            return record

    async def get(self, box_id: str, *, include_deleted: bool = False) -> BoxRecord | None:
        async with self._session_factory() as session:
            stmt = select(BoxRecord).where(BoxRecord.id == box_id)
            if not include_deleted:
                stmt = stmt.where(BoxRecord.deleted_at.is_(None))
            result = await session.execute(stmt)
            return result.scalar_one_or_none()

    async def get_many(
        self, box_ids: Iterable[str], *, include_deleted: bool = False
    ) -> dict[str, BoxRecord]:
        ids = [bid for bid in box_ids if bid]
        if not ids:
            return {}
        async with self._session_factory() as session:
            stmt = select(BoxRecord).where(BoxRecord.id.in_(ids))
            if not include_deleted:
                stmt = stmt.where(BoxRecord.deleted_at.is_(None))
            result = await session.execute(stmt)
            return {r.id: r for r in result.scalars().all()}

    async def list_for_project(
        self, project_id: str, *, include_deleted: bool = False
    ) -> list[BoxRecord]:
        async with self._session_factory() as session:
            stmt = select(BoxRecord).where(BoxRecord.project_id == project_id)
            if not include_deleted:
                stmt = stmt.where(BoxRecord.deleted_at.is_(None))
            stmt = stmt.order_by(BoxRecord.created_at.desc())
            result = await session.execute(stmt)
            return list(result.scalars().all())

    async def update_metadata(
        self,
        box_id: str,
        *,
        name: str | None = None,
        description: str | None = None,
        tags: list[str] | None = None,
    ) -> BoxRecord | None:
        async with self._session_factory() as session:
            stmt = select(BoxRecord).where(
                BoxRecord.id == box_id,
                BoxRecord.deleted_at.is_(None),
            )
            result = await session.execute(stmt)
            record = result.scalar_one_or_none()
            if record is None:
                return None
            if name is not None:
                record.name = name
            if description is not None:
                record.description = description
            if tags is not None:
                record.tags_json = json.dumps(tags)
            record.updated_at = datetime.now(UTC)
            await session.commit()
            await session.refresh(record)
            return record

    async def soft_delete(self, box_id: str) -> bool:
        async with self._session_factory() as session:
            stmt = select(BoxRecord).where(
                BoxRecord.id == box_id,
                BoxRecord.deleted_at.is_(None),
            )
            result = await session.execute(stmt)
            record = result.scalar_one_or_none()
            if record is None:
                return False
            record.deleted_at = datetime.now(UTC)
            record.updated_at = datetime.now(UTC)
            await session.commit()
            return True

    async def hard_delete(self, box_id: str) -> bool:
        async with self._session_factory() as session:
            record = await session.get(BoxRecord, box_id)
            if record is None:
                return False
            await session.delete(record)
            await session.commit()
            return True
