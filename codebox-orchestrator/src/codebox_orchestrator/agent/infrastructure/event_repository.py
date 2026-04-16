"""Repository for persisted Box stream events and live projections."""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import select

from codebox_orchestrator.agent.infrastructure import orm_models as orm
from codebox_orchestrator.box.infrastructure.orm_models import BoxRecord

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker


class SqlAlchemyBoxEventRepository:
    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._sf = session_factory

    async def append_event(self, box_id: str, event: dict[str, Any]) -> dict[str, Any]:
        async with self._sf() as db:
            box = await db.get(BoxRecord, box_id)
            if box is None:
                msg = f"Cannot append event for unknown box: {box_id}"
                raise ValueError(msg)

            seq_stmt = select(orm.BoxProjectionRecord).where(
                orm.BoxProjectionRecord.box_id == box_id
            )
            projection = (await db.execute(seq_stmt)).scalar_one_or_none()
            if projection is None:
                projection = orm.BoxProjectionRecord(
                    box_id=box_id,
                    project_id=box.project_id,
                    last_seq=0,
                )
                db.add(projection)
                await db.flush()

            next_seq = projection.last_seq + 1
            payload = event.get("payload", {}) or {}
            stored = {
                "seq": next_seq,
                "event_id": event.get("event_id") or f"evt_{uuid.uuid4().hex}",
                "timestamp_ms": int(
                    event.get("timestamp_ms") or datetime.now(UTC).timestamp() * 1000
                ),
                "kind": event.get("kind", ""),
                "run_id": event.get("run_id", ""),
                "turn_id": event.get("turn_id", ""),
                "message_id": event.get("message_id", ""),
                "tool_call_id": event.get("tool_call_id", ""),
                "command_id": event.get("command_id", ""),
                "payload": payload,
            }

            db.add(
                orm.BoxEventRecord(
                    project_id=box.project_id,
                    box_id=box_id,
                    seq=next_seq,
                    kind=stored["kind"],
                    event_id=stored["event_id"],
                    timestamp_ms=stored["timestamp_ms"],
                    run_id=stored["run_id"] or None,
                    turn_id=stored["turn_id"] or None,
                    message_id=stored["message_id"] or None,
                    tool_call_id=stored["tool_call_id"] or None,
                    command_id=stored["command_id"] or None,
                    payload_json=json.dumps(payload),
                )
            )

            projection.project_id = box.project_id
            projection.last_seq = next_seq
            self._apply_projection(projection, stored)
            await db.commit()
            return stored

    async def list_events(
        self,
        box_id: str,
        *,
        after_seq: int | None = None,
        limit: int | None = None,
    ) -> list[dict[str, Any]]:
        async with self._sf() as db:
            stmt = select(orm.BoxEventRecord).where(orm.BoxEventRecord.box_id == box_id)
            if after_seq is not None:
                stmt = stmt.where(orm.BoxEventRecord.seq > after_seq)
            stmt = stmt.order_by(orm.BoxEventRecord.seq.asc())
            if limit is not None:
                stmt = stmt.limit(limit)
            rows = (await db.execute(stmt)).scalars().all()
            return [self._to_dict(r) for r in rows]

    async def get_projection(self, box_id: str) -> dict[str, Any] | None:
        async with self._sf() as db:
            projection = await db.get(orm.BoxProjectionRecord, box_id)
            if projection is None:
                return None
            return {
                "box_id": projection.box_id,
                "project_id": projection.project_id,
                "last_seq": projection.last_seq,
                "activity": projection.activity,
                "box_outcome": projection.box_outcome,
                "box_outcome_message": projection.box_outcome_message,
            }

    @staticmethod
    def _apply_projection(projection: orm.BoxProjectionRecord, event: dict[str, Any]) -> None:
        payload = event.get("payload", {}) or {}
        kind = event.get("kind", "")
        if kind == "state.changed":
            projection.activity = payload.get("activity") or projection.activity
        elif kind == "outcome.declared":
            projection.box_outcome = payload.get("status") or projection.box_outcome
            projection.box_outcome_message = (
                payload.get("message") or projection.box_outcome_message
            )
        elif kind == "run.failed":
            projection.box_outcome = "unable_to_proceed"
            projection.box_outcome_message = payload.get("error", projection.box_outcome_message)
        elif kind == "run.completed" and not projection.box_outcome:
            projection.box_outcome = "completed"
        projection.updated_at = datetime.now(UTC)

    @staticmethod
    def _to_dict(record: orm.BoxEventRecord) -> dict[str, Any]:
        return {
            "seq": record.seq,
            "event_id": record.event_id,
            "timestamp_ms": record.timestamp_ms,
            "kind": record.kind,
            "run_id": record.run_id or "",
            "turn_id": record.turn_id or "",
            "message_id": record.message_id or "",
            "tool_call_id": record.tool_call_id or "",
            "command_id": record.command_id or "",
            "payload": json.loads(record.payload_json) if record.payload_json else {},
        }
