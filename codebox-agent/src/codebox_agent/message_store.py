"""Persistent message and state storage backed by SQLite.

Stores chat messages and key-value box state in the same SQLite database
used for LangGraph checkpoints, so data persists across container restarts
via the named Docker volume.
"""

from __future__ import annotations

import contextlib
import json
import logging
from datetime import UTC, datetime

import aiosqlite

logger = logging.getLogger(__name__)

_SCHEMA = """\
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    seq INTEGER NOT NULL,
    role TEXT NOT NULL,
    content TEXT,
    tool_calls TEXT,
    tool_call_id TEXT,
    tool_name TEXT,
    metadata_json TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS box_state (
    key TEXT PRIMARY KEY,
    value TEXT
);
"""


class MessageStore:
    """Async SQLite store for chat messages and box state."""

    def __init__(self, db_path: str) -> None:
        self._db_path = db_path
        self._conn: aiosqlite.Connection | None = None

    async def setup(self) -> None:
        """Open the database and create tables if needed."""
        self._conn = await aiosqlite.connect(self._db_path)
        await self._conn.executescript(_SCHEMA)
        await self._conn.commit()

    async def close(self) -> None:
        if self._conn:
            await self._conn.close()
            self._conn = None

    async def append_message(
        self,
        *,
        role: str,
        content: str | None = None,
        tool_calls: list[dict] | None = None,
        tool_call_id: str | None = None,
        tool_name: str | None = None,
        metadata_json: str | None = None,
    ) -> None:
        """Append a chat message to the store."""
        assert self._conn is not None
        # Auto-assign seq as max(seq) + 1
        cursor = await self._conn.execute("SELECT COALESCE(MAX(seq), -1) FROM messages")
        row = await cursor.fetchone()
        seq = (row[0] if row else -1) + 1

        tool_calls_json = json.dumps(tool_calls) if tool_calls else None
        now = datetime.now(UTC).isoformat()

        await self._conn.execute(
            "INSERT INTO messages "
            "(seq, role, content, tool_calls, tool_call_id, "
            "tool_name, metadata_json, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (seq, role, content, tool_calls_json, tool_call_id, tool_name, metadata_json, now),
        )
        await self._conn.commit()

    async def get_messages(self) -> list[dict]:
        """Return all messages ordered by seq."""
        assert self._conn is not None
        cursor = await self._conn.execute(
            "SELECT seq, role, content, tool_calls, "
            "tool_call_id, tool_name, metadata_json, created_at "
            "FROM messages ORDER BY seq"
        )
        rows = await cursor.fetchall()
        results = []
        for row in rows:
            tool_calls = None
            if row[3]:
                with contextlib.suppress(json.JSONDecodeError, TypeError):
                    tool_calls = json.loads(row[3])
            results.append(
                {
                    "seq": row[0],
                    "role": row[1],
                    "content": row[2],
                    "tool_calls": tool_calls,
                    "tool_call_id": row[4],
                    "tool_name": row[5],
                    "metadata_json": row[6],
                    "created_at": row[7],
                }
            )
        return results

    async def set_state(self, key: str, value: str) -> None:
        """Set a key-value pair in the box_state table."""
        assert self._conn is not None
        await self._conn.execute(
            "INSERT OR REPLACE INTO box_state (key, value) VALUES (?, ?)",
            (key, value),
        )
        await self._conn.commit()

    async def get_state(self, key: str) -> str | None:
        """Get a value from the box_state table."""
        assert self._conn is not None
        cursor = await self._conn.execute("SELECT value FROM box_state WHERE key = ?", (key,))
        row = await cursor.fetchone()
        return row[0] if row else None
