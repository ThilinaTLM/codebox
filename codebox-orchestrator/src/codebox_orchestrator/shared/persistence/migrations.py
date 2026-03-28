"""Lightweight idempotent migrations for the orchestrator database.

New tables are created automatically by Base.metadata.create_all().
This module handles cleanup of legacy tables from the Task/Sandbox era.
"""

from __future__ import annotations

import logging

from sqlalchemy import inspect, text
from sqlalchemy.ext.asyncio import AsyncEngine

logger = logging.getLogger(__name__)

# Legacy tables to drop (from the old Task + Sandbox split)
_LEGACY_TABLES = [
    "task_events",
    "sandbox_events",
    "feedback_requests",  # will be recreated with box_id FK
    "tasks",
    "sandboxes",
]


async def run_migrations(engine: AsyncEngine) -> None:
    """Drop legacy tables if they exist (idempotent — safe to run on every startup)."""
    async with engine.begin() as conn:
        existing = await conn.run_sync(
            lambda sync_conn: inspect(sync_conn).get_table_names()
        )
        for table in _LEGACY_TABLES:
            if table in existing:
                await conn.execute(text(f"DROP TABLE IF EXISTS {table}"))
                logger.info("Migration: dropped legacy table %s", table)
