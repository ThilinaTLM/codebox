"""Persistent event and projection storage backed by SQLite.

Stores canonical stream events plus a small derived projection in the same
SQLite database used for LangGraph checkpoints, so Box-local state survives
container restarts.
"""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from typing import Any

import aiosqlite

logger = logging.getLogger(__name__)

_SCHEMA = """\
CREATE TABLE IF NOT EXISTS events (
    seq INTEGER PRIMARY KEY,
    kind TEXT NOT NULL,
    event_id TEXT,
    timestamp_ms INTEGER NOT NULL,
    run_id TEXT,
    turn_id TEXT,
    message_id TEXT,
    tool_call_id TEXT,
    command_id TEXT,
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS box_state (
    key TEXT PRIMARY KEY,
    value TEXT
);
"""


class EventStore:
    """Async SQLite store for canonical events and derived box state."""

    def __init__(self, db_path: str) -> None:
        self._db_path = db_path
        self._conn: aiosqlite.Connection | None = None

    async def setup(self) -> None:
        self._conn = await aiosqlite.connect(self._db_path)
        await self._conn.executescript(_SCHEMA)
        await self._conn.commit()

    async def close(self) -> None:
        if self._conn:
            await self._conn.close()
            self._conn = None

    async def append_event(self, event: dict[str, Any]) -> dict[str, Any]:
        """Persist an event, assigning local seq/timestamp when needed."""
        assert self._conn is not None
        cursor = await self._conn.execute("SELECT COALESCE(MAX(seq), 0) FROM events")
        row = await cursor.fetchone()
        seq = int(row[0] if row and row[0] is not None else 0) + 1
        timestamp_ms = int(event.get("timestamp_ms") or datetime.now(UTC).timestamp() * 1000)
        created_at = datetime.now(UTC).isoformat()
        stored = {
            "seq": seq,
            "event_id": event.get("event_id", ""),
            "timestamp_ms": timestamp_ms,
            "kind": event.get("kind", ""),
            "run_id": event.get("run_id", ""),
            "turn_id": event.get("turn_id", ""),
            "message_id": event.get("message_id", ""),
            "tool_call_id": event.get("tool_call_id", ""),
            "command_id": event.get("command_id", ""),
            "payload": event.get("payload", {}) or {},
        }

        await self._conn.execute(
            "INSERT INTO events ("
            "seq, kind, event_id, timestamp_ms, run_id, turn_id, message_id, "
            "tool_call_id, command_id, payload_json, created_at"
            ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                stored["seq"],
                stored["kind"],
                stored["event_id"],
                stored["timestamp_ms"],
                stored["run_id"],
                stored["turn_id"],
                stored["message_id"],
                stored["tool_call_id"],
                stored["command_id"],
                json.dumps(stored["payload"]),
                created_at,
            ),
        )
        await self.apply_projection(stored)
        await self._conn.commit()
        return stored

    async def list_events(
        self,
        *,
        after_seq: int | None = None,
        limit: int | None = None,
    ) -> list[dict[str, Any]]:
        assert self._conn is not None
        sql = (
            "SELECT seq, kind, event_id, timestamp_ms, run_id, turn_id, message_id, tool_call_id, "
            "command_id, payload_json FROM events"
        )
        params: list[Any] = []
        if after_seq is not None:
            sql += " WHERE seq > ?"
            params.append(after_seq)
        sql += " ORDER BY seq ASC"
        if limit is not None:
            sql += " LIMIT ?"
            params.append(limit)
        cursor = await self._conn.execute(sql, tuple(params))
        rows = await cursor.fetchall()
        return [
            {
                "seq": row[0],
                "kind": row[1],
                "event_id": row[2] or "",
                "timestamp_ms": row[3],
                "run_id": row[4] or "",
                "turn_id": row[5] or "",
                "message_id": row[6] or "",
                "tool_call_id": row[7] or "",
                "command_id": row[8] or "",
                "payload": json.loads(row[9]) if row[9] else {},
            }
            for row in rows
        ]

    async def apply_projection(self, event: dict[str, Any]) -> None:
        kind = event.get("kind", "")
        payload = event.get("payload", {}) or {}
        await self.set_state("last_seq", str(event.get("seq", "")))
        if kind == "state.changed":
            activity = payload.get("activity", "")
            if activity:
                await self.set_state("activity", activity)
        elif kind == "outcome.declared":
            status = payload.get("status", "")
            message = payload.get("message", "")
            await self.set_state("task_outcome", status)
            await self.set_state("task_outcome_message", message)
        elif kind in {"run.failed", "command.failed"}:
            await self.set_state("task_outcome", "unable_to_proceed")
            error = payload.get("error", "")
            if error:
                await self.set_state("task_outcome_message", error)

    async def set_state(self, key: str, value: str) -> None:
        assert self._conn is not None
        await self._conn.execute(
            "INSERT OR REPLACE INTO box_state (key, value) VALUES (?, ?)",
            (key, value),
        )

    async def get_state(self, key: str) -> str | None:
        assert self._conn is not None
        cursor = await self._conn.execute("SELECT value FROM box_state WHERE key = ?", (key,))
        row = await cursor.fetchone()
        return row[0] if row else None

    async def get_projection(self) -> dict[str, str]:
        assert self._conn is not None
        cursor = await self._conn.execute("SELECT key, value FROM box_state")
        rows = await cursor.fetchall()
        return {str(key): str(value) for key, value in rows}
