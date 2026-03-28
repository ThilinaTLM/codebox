"""SQLAlchemy implementation of BoxRepository."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from codebox_orchestrator.box.domain import entities as domain
from codebox_orchestrator.box.infrastructure import mappers
from codebox_orchestrator.box.infrastructure import orm_models as orm
from codebox_orchestrator.box.ports.box_repository import BoxFilters


class SqlAlchemyBoxRepository:
    """Implements BoxRepository by delegating to SQLAlchemy ORM models."""

    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._sf = session_factory

    async def get(self, box_id: str) -> domain.Box | None:
        async with self._sf() as db:
            db_box = await db.get(orm.Box, box_id)
            if db_box is None:
                return None
            return mappers.box_to_domain(db_box)

    async def save(self, box: domain.Box) -> None:
        async with self._sf() as db:
            db_box = await db.get(orm.Box, box.id)
            if db_box is None:
                db_box = mappers.domain_to_orm(box)
                db.add(db_box)
            else:
                mappers.update_orm_from_domain(db_box, box)
            await db.commit()

    async def delete(self, box_id: str) -> None:
        async with self._sf() as db:
            db_box = await db.get(orm.Box, box_id)
            if db_box:
                await db.delete(db_box)
                await db.commit()

    async def list(self, filters: BoxFilters | None = None) -> list[domain.Box]:
        async with self._sf() as db:
            stmt = select(orm.Box).order_by(orm.Box.created_at.desc())
            if filters:
                if filters.container_status is not None:
                    stmt = stmt.where(orm.Box.container_status == filters.container_status)
                if filters.activity is not None:
                    stmt = stmt.where(orm.Box.activity == filters.activity)
                if filters.trigger is not None:
                    stmt = stmt.where(orm.Box.trigger == filters.trigger)
            result = await db.execute(stmt)
            return [mappers.box_to_domain(b) for b in result.scalars().all()]

    async def add_event(self, box_id: str, event_type: str, data: str) -> None:
        async with self._sf() as db:
            ev = orm.BoxEvent(box_id=box_id, event_type=event_type, data=data)
            db.add(ev)
            await db.commit()

    async def add_message(self, box_id: str, message: domain.BoxMessage) -> None:
        """Persist a message, auto-assigning the next sequence number."""
        async with self._sf() as db:
            result = await db.execute(
                select(func.coalesce(func.max(orm.BoxMessage.seq), 0)).where(
                    orm.BoxMessage.box_id == box_id
                )
            )
            next_seq = result.scalar() + 1

            bm = orm.BoxMessage(
                box_id=box_id,
                seq=next_seq,
                role=message.role,
                content=message.content,
                tool_calls=message.tool_calls,
                tool_call_id=message.tool_call_id,
                tool_name=message.tool_name,
                metadata_json=message.metadata_json,
            )
            db.add(bm)
            await db.commit()

    async def get_events(self, box_id: str) -> list[domain.BoxEvent]:
        async with self._sf() as db:
            stmt = (
                select(orm.BoxEvent)
                .where(orm.BoxEvent.box_id == box_id)
                .order_by(orm.BoxEvent.id)
            )
            result = await db.execute(stmt)
            return [mappers.box_event_to_domain(e) for e in result.scalars().all()]

    async def get_messages(self, box_id: str) -> list[domain.BoxMessage]:
        async with self._sf() as db:
            stmt = (
                select(orm.BoxMessage)
                .where(orm.BoxMessage.box_id == box_id)
                .order_by(orm.BoxMessage.seq)
            )
            result = await db.execute(stmt)
            return [mappers.box_message_to_domain(m) for m in result.scalars().all()]

    async def get_next_message_seq(self, box_id: str) -> int:
        async with self._sf() as db:
            result = await db.execute(
                select(func.coalesce(func.max(orm.BoxMessage.seq), 0)).where(
                    orm.BoxMessage.box_id == box_id
                )
            )
            return result.scalar() + 1
