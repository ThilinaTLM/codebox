"""Lightweight schema migration helpers.

Since the project uses ``metadata.create_all()`` (no Alembic), new columns on
existing tables require explicit ``ALTER TABLE`` statements.  The helpers here
are idempotent — they inspect the live schema and only add columns that are
missing.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from sqlalchemy import inspect, text

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncConnection

logger = logging.getLogger(__name__)

# (table_name, column_name, column_type_sql)
_PENDING_COLUMNS: list[tuple[str, str, str]] = [
    ("users", "first_name", "VARCHAR(255)"),
    ("users", "last_name", "VARCHAR(255)"),
]


async def apply_pending_migrations(conn: AsyncConnection) -> None:
    """Add any missing columns listed in ``_PENDING_COLUMNS``."""

    def _sync(sync_conn):  # type: ignore[no-untyped-def]
        insp = inspect(sync_conn)
        for table, column, col_type in _PENDING_COLUMNS:
            if not insp.has_table(table):
                continue
            existing = {c["name"] for c in insp.get_columns(table)}
            if column in existing:
                continue
            stmt = f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"
            sync_conn.execute(text(stmt))
            logger.info("Migration: added column %s.%s", table, column)

    await conn.run_sync(_sync)
