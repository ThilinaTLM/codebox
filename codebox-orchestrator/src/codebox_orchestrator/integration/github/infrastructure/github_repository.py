"""SQLAlchemy repository for GitHub installations and events (project-scoped)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import and_, or_, select

from codebox_orchestrator.integration.github.domain import entities as domain
from codebox_orchestrator.integration.github.infrastructure import orm_models as orm

if TYPE_CHECKING:
    from datetime import datetime

    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker


class SqlAlchemyGitHubRepository:
    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._sf = session_factory

    async def get_installation(self, installation_id: str) -> domain.GitHubInstallation | None:
        async with self._sf() as db:
            inst = await db.get(orm.GitHubInstallation, installation_id)
            if inst is None:
                return None
            return self._to_domain_installation(inst)

    async def get_installation_by_github_id(
        self, installation_id: int, *, project_id: str | None = None
    ) -> domain.GitHubInstallation | None:
        async with self._sf() as db:
            stmt = select(orm.GitHubInstallation).where(
                orm.GitHubInstallation.installation_id == installation_id
            )
            if project_id:
                stmt = stmt.where(orm.GitHubInstallation.project_id == project_id)
            result = await db.execute(stmt)
            inst = result.scalar_one_or_none()
            if inst is None:
                return None
            return self._to_domain_installation(inst)

    async def list_installations(self, project_id: str) -> list[domain.GitHubInstallation]:
        async with self._sf() as db:
            stmt = (
                select(orm.GitHubInstallation)
                .where(orm.GitHubInstallation.project_id == project_id)
                .order_by(orm.GitHubInstallation.created_at.desc())
            )
            result = await db.execute(stmt)
            return [self._to_domain_installation(i) for i in result.scalars().all()]

    async def store_installation(
        self,
        installation_id: int,
        account_login: str,
        account_type: str,
        *,
        project_id: str,
    ) -> domain.GitHubInstallation:
        async with self._sf() as db:
            stmt = select(orm.GitHubInstallation).where(
                orm.GitHubInstallation.installation_id == installation_id,
                orm.GitHubInstallation.project_id == project_id,
            )
            result = await db.execute(stmt)
            existing = result.scalar_one_or_none()
            if existing:
                existing.account_login = account_login
                existing.account_type = account_type
                await db.commit()
                await db.refresh(existing)
                return self._to_domain_installation(existing)

            inst = orm.GitHubInstallation(
                project_id=project_id,
                installation_id=installation_id,
                account_login=account_login,
                account_type=account_type,
            )
            db.add(inst)
            await db.commit()
            await db.refresh(inst)
            return self._to_domain_installation(inst)

    async def delete_installation(self, installation_id: str, *, project_id: str) -> bool:
        async with self._sf() as db:
            inst = await db.get(orm.GitHubInstallation, installation_id)
            if inst is None or inst.project_id != project_id:
                return False
            await db.delete(inst)
            await db.commit()
            return True

    async def event_exists(self, delivery_id: str) -> bool:
        async with self._sf() as db:
            stmt = select(orm.GitHubEvent).where(orm.GitHubEvent.delivery_id == delivery_id)
            result = await db.execute(stmt)
            return result.scalar_one_or_none() is not None

    async def store_event(
        self,
        delivery_id: str,
        event_type: str,
        action: str,
        repository: str,
        payload: str,
        *,
        project_id: str,
    ) -> str:
        async with self._sf() as db:
            event = orm.GitHubEvent(
                project_id=project_id,
                delivery_id=delivery_id,
                event_type=event_type,
                action=action,
                repository=repository,
                payload=payload,
            )
            db.add(event)
            await db.commit()
            return event.id

    async def update_event_box_id(self, event_id: str, box_id: str) -> None:
        async with self._sf() as db:
            ev = await db.get(orm.GitHubEvent, event_id)
            if ev:
                ev.box_id = box_id
                await db.commit()

    async def list_events(
        self,
        *,
        project_id: str,
        delivery_id: str | None = None,
        event_type: str | None = None,
        action: str | None = None,
        box_id: str | None = None,
        limit: int = 50,
        cursor: tuple[datetime, str] | None = None,
    ) -> list[orm.GitHubEvent]:
        async with self._sf() as db:
            stmt = select(orm.GitHubEvent).where(orm.GitHubEvent.project_id == project_id)
            if delivery_id:
                stmt = stmt.where(orm.GitHubEvent.delivery_id == delivery_id)
            if event_type:
                stmt = stmt.where(orm.GitHubEvent.event_type == event_type)
            if action:
                stmt = stmt.where(orm.GitHubEvent.action == action)
            if box_id:
                stmt = stmt.where(orm.GitHubEvent.box_id == box_id)
            if cursor is not None:
                created_at, event_id_cursor = cursor
                stmt = stmt.where(
                    or_(
                        orm.GitHubEvent.created_at < created_at,
                        and_(
                            orm.GitHubEvent.created_at == created_at,
                            orm.GitHubEvent.id < event_id_cursor,
                        ),
                    )
                )
            stmt = stmt.order_by(orm.GitHubEvent.created_at.desc(), orm.GitHubEvent.id.desc())
            stmt = stmt.limit(limit)
            result = await db.execute(stmt)
            return list(result.scalars().all())

    @staticmethod
    def _to_domain_installation(inst: orm.GitHubInstallation) -> domain.GitHubInstallation:
        return domain.GitHubInstallation(
            id=inst.id,
            installation_id=inst.installation_id,
            account_login=inst.account_login,
            account_type=inst.account_type,
            settings=inst.settings,
            created_at=inst.created_at,
        )
