"""Run Alembic migrations programmatically at application startup."""

from __future__ import annotations

import logging
from pathlib import Path

from alembic import command
from alembic.config import Config

from codebox_orchestrator.config import settings

logger = logging.getLogger(__name__)

# In development: alembic/ is at the project root (5 levels up from this file).
# In Docker: alembic/ is at /app/alembic (copied by Dockerfile).
_DEV_ALEMBIC_DIR = Path(__file__).resolve().parent.parent.parent.parent.parent / "alembic"
_DOCKER_ALEMBIC_DIR = Path("/app/alembic")
_ALEMBIC_DIR = _DEV_ALEMBIC_DIR if _DEV_ALEMBIC_DIR.is_dir() else _DOCKER_ALEMBIC_DIR


def _sync_url() -> str:
    """Convert the async ``database_url`` to a sync one for Alembic.

    ``asyncpg`` → ``psycopg`` (sync driver already in dependencies).
    """
    return settings.database_url.replace("+asyncpg", "+psycopg")


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
