"""Async repository for automations and their runs."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import and_, delete, func, or_, select

from codebox_orchestrator.automation.models import (
    Automation,
    AutomationRun,
)

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import async_sessionmaker


class AutomationRepository:
    """Persistence facade for Automation + AutomationRun."""

    def __init__(self, session_factory: async_sessionmaker) -> None:
        self._sf = session_factory

    # ── Automations ─────────────────────────────────────────────

    async def list(
        self,
        project_id: str,
        *,
        trigger_kind: str | None = None,
        enabled: bool | None = None,
    ) -> list[Automation]:
        async with self._sf() as db:
            stmt = select(Automation).where(Automation.project_id == project_id)
            if trigger_kind is not None:
                stmt = stmt.where(Automation.trigger_kind == trigger_kind)
            if enabled is not None:
                stmt = stmt.where(Automation.enabled.is_(enabled))
            stmt = stmt.order_by(Automation.created_at)
            result = await db.execute(stmt)
            return list(result.scalars().all())

    async def get(self, automation_id: str, *, project_id: str) -> Automation | None:
        async with self._sf() as db:
            stmt = select(Automation).where(
                Automation.id == automation_id,
                Automation.project_id == project_id,
            )
            result = await db.execute(stmt)
            return result.scalar_one_or_none()

    async def get_by_name(self, project_id: str, name: str) -> Automation | None:
        async with self._sf() as db:
            stmt = select(Automation).where(
                Automation.project_id == project_id,
                Automation.name == name,
            )
            result = await db.execute(stmt)
            return result.scalar_one_or_none()

    async def create(self, automation: Automation) -> Automation:
        async with self._sf() as db:
            db.add(automation)
            await db.commit()
            await db.refresh(automation)
            return automation

    async def update(
        self,
        automation_id: str,
        *,
        project_id: str,
        **fields: Any,
    ) -> Automation | None:
        async with self._sf() as db:
            stmt = select(Automation).where(
                Automation.id == automation_id,
                Automation.project_id == project_id,
            )
            result = await db.execute(stmt)
            automation = result.scalar_one_or_none()
            if automation is None:
                return None
            for key, value in fields.items():
                setattr(automation, key, value)
            automation.updated_at = datetime.now(UTC)
            await db.commit()
            await db.refresh(automation)
            return automation

    async def delete(self, automation_id: str, *, project_id: str) -> bool:
        async with self._sf() as db:
            stmt = select(Automation).where(
                Automation.id == automation_id,
                Automation.project_id == project_id,
            )
            result = await db.execute(stmt)
            automation = result.scalar_one_or_none()
            if automation is None:
                return False
            await db.delete(automation)
            await db.commit()
            return True

    # ── Trigger-time queries (used by webhook dispatcher + scheduler) ──

    async def list_enabled_for_event(self, project_id: str, trigger_kind: str) -> list[Automation]:
        async with self._sf() as db:
            stmt = (
                select(Automation)
                .where(
                    Automation.project_id == project_id,
                    Automation.trigger_kind == trigger_kind,
                    Automation.enabled.is_(True),
                )
                .order_by(Automation.created_at)
            )
            result = await db.execute(stmt)
            return list(result.scalars().all())

    async def list_due_scheduled(self, now: datetime, *, limit: int = 50) -> list[Automation]:
        async with self._sf() as db:
            stmt = (
                select(Automation)
                .where(
                    Automation.trigger_kind == "schedule",
                    Automation.enabled.is_(True),
                    Automation.next_run_at.isnot(None),
                    Automation.next_run_at <= now,
                )
                .order_by(Automation.next_run_at)
                .limit(limit)
            )
            result = await db.execute(stmt)
            return list(result.scalars().all())

    async def set_next_run_at(self, automation_id: str, next_run_at: datetime | None) -> None:
        async with self._sf() as db:
            stmt = select(Automation).where(Automation.id == automation_id)
            result = await db.execute(stmt)
            automation = result.scalar_one_or_none()
            if automation is None:
                return
            automation.next_run_at = next_run_at
            await db.commit()

    async def count_scheduled(self, project_id: str) -> int:
        async with self._sf() as db:
            stmt = select(func.count(Automation.id)).where(
                Automation.project_id == project_id,
                Automation.trigger_kind == "schedule",
            )
            result = await db.execute(stmt)
            return int(result.scalar_one() or 0)

    async def min_next_run_at(self) -> datetime | None:
        async with self._sf() as db:
            stmt = select(func.min(Automation.next_run_at)).where(
                Automation.trigger_kind == "schedule",
                Automation.enabled.is_(True),
                Automation.next_run_at.isnot(None),
            )
            result = await db.execute(stmt)
            return result.scalar_one_or_none()

    # ── Runs ─────────────────────────────────────────────────────

    async def record_run(
        self,
        *,
        project_id: str,
        automation_id: str,
        trigger_kind: str,
        status: str,
        box_id: str | None = None,
        github_event_id: str | None = None,
        error: str | None = None,
    ) -> str:
        run = AutomationRun(
            project_id=project_id,
            automation_id=automation_id,
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
        automation_id: str | None = None,
        status: str | None = None,
        limit: int = 50,
        cursor: tuple[datetime, str] | None = None,
    ) -> list[AutomationRun]:
        async with self._sf() as db:
            stmt = select(AutomationRun).where(AutomationRun.project_id == project_id)
            if automation_id is not None:
                stmt = stmt.where(AutomationRun.automation_id == automation_id)
            if status is not None:
                stmt = stmt.where(AutomationRun.status == status)
            if cursor is not None:
                created_at, run_id_cursor = cursor
                stmt = stmt.where(
                    or_(
                        AutomationRun.created_at < created_at,
                        and_(
                            AutomationRun.created_at == created_at,
                            AutomationRun.id < run_id_cursor,
                        ),
                    )
                )
            stmt = stmt.order_by(
                AutomationRun.created_at.desc(),
                AutomationRun.id.desc(),
            ).limit(limit)
            result = await db.execute(stmt)
            return list(result.scalars().all())

    async def prune_old_runs(self, project_id: str, older_than: datetime) -> int:
        async with self._sf() as db:
            stmt = delete(AutomationRun).where(
                AutomationRun.project_id == project_id,
                AutomationRun.created_at < older_than,
                # Only prune status=skipped_filter to retain spawn/error history
                AutomationRun.status == "skipped_filter",
            )
            result = await db.execute(stmt)
            await db.commit()
            return result.rowcount or 0
