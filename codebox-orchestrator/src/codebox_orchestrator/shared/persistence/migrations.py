"""Lightweight idempotent migrations for the orchestrator database.

New tables are created automatically by Base.metadata.create_all().
This module handles cleanup of legacy tables from the Task/Sandbox era.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from sqlalchemy import inspect, text

if TYPE_CHECKING:
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
    """Run idempotent migrations on every startup."""
    async with engine.begin() as conn:
        existing = await conn.run_sync(lambda sync_conn: inspect(sync_conn).get_table_names())

        # Drop legacy tables from the old Task + Sandbox split
        for table in _LEGACY_TABLES:
            if table in existing:
                await conn.execute(text(f"DROP TABLE IF EXISTS {table}"))
                logger.info("Migration: dropped legacy table %s", table)

        # Rename system_prompt → dynamic_system_prompt (SQLite 3.25+)
        if "boxes" in existing:
            columns = await conn.run_sync(
                lambda sync_conn: [col["name"] for col in inspect(sync_conn).get_columns("boxes")]
            )
            if "system_prompt" in columns and "dynamic_system_prompt" not in columns:
                await conn.execute(
                    text("ALTER TABLE boxes RENAME COLUMN system_prompt TO dynamic_system_prompt")
                )
                logger.info("Migration: renamed boxes.system_prompt → dynamic_system_prompt")
            if "provider" not in columns:
                await conn.execute(
                    text("ALTER TABLE boxes ADD COLUMN provider VARCHAR(50) DEFAULT 'openrouter'")
                )
                logger.info("Migration: added boxes.provider")
