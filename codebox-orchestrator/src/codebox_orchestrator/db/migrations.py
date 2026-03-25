"""Lightweight idempotent migrations for adding columns to existing tables.

New tables are created automatically by Base.metadata.create_all().
This module handles ALTER TABLE for columns added to existing tables.
"""

from __future__ import annotations

import logging

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

logger = logging.getLogger(__name__)

# Each entry: (table, column_name, column_def)
_TASK_NEW_COLUMNS = [
    ("tasks", "github_installation_id", "VARCHAR(36)"),
    ("tasks", "github_repo", "VARCHAR(255)"),
    ("tasks", "github_issue_number", "INTEGER"),
    ("tasks", "github_trigger_url", "VARCHAR(512)"),
    ("tasks", "github_branch", "VARCHAR(255)"),
    ("tasks", "github_pr_number", "INTEGER"),
]


async def run_migrations(engine: AsyncEngine) -> None:
    """Add new columns to existing tables (idempotent — safe to run on every startup)."""
    async with engine.begin() as conn:
        for table, column, col_type in _TASK_NEW_COLUMNS:
            stmt = f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"
            try:
                await conn.execute(text(stmt))
                logger.info("Migration: added %s.%s", table, column)
            except Exception:
                # Column already exists — expected on subsequent startups
                pass
