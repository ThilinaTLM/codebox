"""Run Alembic migrations programmatically at application startup."""

from __future__ import annotations

import logging
from pathlib import Path

from alembic import command
from alembic.config import Config

from codebox_orchestrator.config import DATABASE_URL

logger = logging.getLogger(__name__)

_ALEMBIC_DIR = Path(__file__).resolve().parent.parent.parent.parent.parent / "alembic"


def _sync_url() -> str:
    """Convert the async DATABASE_URL to a sync one for Alembic.

    ``asyncpg`` → ``psycopg`` (sync driver already in dependencies).
    """
    return DATABASE_URL.replace("+asyncpg", "+psycopg")


def _build_alembic_config() -> Config:
    """Build an Alembic ``Config`` that points at the project's migration directory."""
    cfg = Config()
    cfg.set_main_option("script_location", str(_ALEMBIC_DIR))
    cfg.set_main_option("sqlalchemy.url", _sync_url())
    return cfg


def run_migrations() -> None:
    """Apply all pending Alembic migrations (``upgrade head``)."""
    logger.info("Running database migrations …")
    cfg = _build_alembic_config()
    command.upgrade(cfg, "head")
    logger.info("Database migrations complete.")
