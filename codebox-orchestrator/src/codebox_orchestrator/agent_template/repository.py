"""Async repository for agent templates and their runs."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import and_, delete, func, or_, select

from codebox_orchestrator.agent_template.models import (
    AgentTemplate,
    AgentTemplateRun,
)

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import async_sessionmaker


class AgentTemplateRepository:
    """Persistence facade for AgentTemplate + AgentTemplateRun."""

    def __init__(self, session_factory: async_sessionmaker) -> None:
        self._sf = session_factory

    # ── Templates ───────────────────────────────────────────────

    async def list(
        self,
        project_id: str,
        *,
        trigger_kind: str | None = None,
        enabled: bool | None = None,
    ) -> list[AgentTemplate]:
        async with self._sf() as db:
            stmt = select(AgentTemplate).where(AgentTemplate.project_id == project_id)
            if trigger_kind is not None:
                stmt = stmt.where(AgentTemplate.trigger_kind == trigger_kind)
            if enabled is not None:
                stmt = stmt.where(AgentTemplate.enabled.is_(enabled))
            stmt = stmt.order_by(AgentTemplate.created_at)
            result = await db.execute(stmt)
            return list(result.scalars().all())

    async def get(self, template_id: str, *, project_id: str) -> AgentTemplate | None:
        async with self._sf() as db:
            stmt = select(AgentTemplate).where(
                AgentTemplate.id == template_id,
                AgentTemplate.project_id == project_id,
            )
            result = await db.execute(stmt)
            return result.scalar_one_or_none()

    async def get_by_name(self, project_id: str, name: str) -> AgentTemplate | None:
        async with self._sf() as db:
            stmt = select(AgentTemplate).where(
                AgentTemplate.project_id == project_id,
                AgentTemplate.name == name,
            )
            result = await db.execute(stmt)
            return result.scalar_one_or_none()

    async def create(self, template: AgentTemplate) -> AgentTemplate:
        async with self._sf() as db:
            db.add(template)
            await db.commit()
            await db.refresh(template)
            return template

    async def update(
        self,
        template_id: str,
        *,
        project_id: str,
        **fields: Any,
    ) -> AgentTemplate | None:
        async with self._sf() as db:
            stmt = select(AgentTemplate).where(
                AgentTemplate.id == template_id,
                AgentTemplate.project_id == project_id,
            )
            result = await db.execute(stmt)
            template = result.scalar_one_or_none()
            if template is None:
                return None
            for key, value in fields.items():
                setattr(template, key, value)
            template.updated_at = datetime.now(UTC)
            await db.commit()
            await db.refresh(template)
            return template

    async def delete(self, template_id: str, *, project_id: str) -> bool:
        async with self._sf() as db:
            stmt = select(AgentTemplate).where(
                AgentTemplate.id == template_id,
                AgentTemplate.project_id == project_id,
            )
            result = await db.execute(stmt)
            template = result.scalar_one_or_none()
            if template is None:
                return False
            await db.delete(template)
            await db.commit()
            return True

    # ── Trigger-time queries (used by webhook dispatcher + scheduler) ──

    async def list_enabled_for_event(
        self, project_id: str, trigger_kind: str
    ) -> list[AgentTemplate]:
        async with self._sf() as db:
            stmt = (
                select(AgentTemplate)
                .where(
                    AgentTemplate.project_id == project_id,
                    AgentTemplate.trigger_kind == trigger_kind,
                    AgentTemplate.enabled.is_(True),
                )
                .order_by(AgentTemplate.created_at)
            )
            result = await db.execute(stmt)
            return list(result.scalars().all())

    async def list_due_scheduled(self, now: datetime, *, limit: int = 50) -> list[AgentTemplate]:
        async with self._sf() as db:
            stmt = (
                select(AgentTemplate)
                .where(
                    AgentTemplate.trigger_kind == "schedule",
                    AgentTemplate.enabled.is_(True),
                    AgentTemplate.next_run_at.isnot(None),
                    AgentTemplate.next_run_at <= now,
                )
                .order_by(AgentTemplate.next_run_at)
                .limit(limit)
            )
            result = await db.execute(stmt)
            return list(result.scalars().all())

    async def set_next_run_at(self, template_id: str, next_run_at: datetime | None) -> None:
        async with self._sf() as db:
            stmt = select(AgentTemplate).where(AgentTemplate.id == template_id)
            result = await db.execute(stmt)
            template = result.scalar_one_or_none()
            if template is None:
                return
            template.next_run_at = next_run_at
            await db.commit()

    async def count_scheduled(self, project_id: str) -> int:
        async with self._sf() as db:
            stmt = select(func.count(AgentTemplate.id)).where(
                AgentTemplate.project_id == project_id,
                AgentTemplate.trigger_kind == "schedule",
            )
            result = await db.execute(stmt)
            return int(result.scalar_one() or 0)

    async def min_next_run_at(self) -> datetime | None:
        async with self._sf() as db:
            stmt = select(func.min(AgentTemplate.next_run_at)).where(
                AgentTemplate.trigger_kind == "schedule",
                AgentTemplate.enabled.is_(True),
                AgentTemplate.next_run_at.isnot(None),
            )
            result = await db.execute(stmt)
            return result.scalar_one_or_none()

    # ── Runs ─────────────────────────────────────────────────────

    async def record_run(
        self,
        *,
        project_id: str,
        template_id: str,
        trigger_kind: str,
        status: str,
        box_id: str | None = None,
        github_event_id: str | None = None,
        error: str | None = None,
    ) -> str:
        run = AgentTemplateRun(
            project_id=project_id,
            template_id=template_id,
            trigger_kind=trigger_kind,
            status=status,
            box_id=box_id,
            github_event_id=github_event_id,
            error=error,
        )
        async with self._sf() as db:
            db.add(run)
            await db.commit()
            await db.refresh(run)
            return run.id

    async def list_runs(
        self,
        project_id: str,
        *,
        template_id: str | None = None,
        status: str | None = None,
        limit: int = 50,
        cursor: tuple[datetime, str] | None = None,
    ) -> list[AgentTemplateRun]:
        async with self._sf() as db:
            stmt = select(AgentTemplateRun).where(AgentTemplateRun.project_id == project_id)
            if template_id is not None:
                stmt = stmt.where(AgentTemplateRun.template_id == template_id)
            if status is not None:
                stmt = stmt.where(AgentTemplateRun.status == status)
            if cursor is not None:
                created_at, run_id_cursor = cursor
                stmt = stmt.where(
                    or_(
                        AgentTemplateRun.created_at < created_at,
                        and_(
                            AgentTemplateRun.created_at == created_at,
                            AgentTemplateRun.id < run_id_cursor,
                        ),
                    )
                )
            stmt = stmt.order_by(
                AgentTemplateRun.created_at.desc(),
                AgentTemplateRun.id.desc(),
            ).limit(limit)
            result = await db.execute(stmt)
            return list(result.scalars().all())

    async def prune_old_runs(self, project_id: str, older_than: datetime) -> int:
        async with self._sf() as db:
            stmt = delete(AgentTemplateRun).where(
                AgentTemplateRun.project_id == project_id,
                AgentTemplateRun.created_at < older_than,
                # Only prune status=skipped_filter to retain spawn/error history
                AgentTemplateRun.status == "skipped_filter",
            )
            result = await db.execute(stmt)
            await db.commit()
            return result.rowcount or 0
