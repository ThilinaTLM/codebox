"""Alembic environment configuration.

Supports both sync execution (programmatic startup via ``migrate.py``, which
passes a sync ``psycopg`` URL) and async CLI execution (``alembic upgrade``
with the default ``asyncpg`` URL from config).

Every model module must be imported so that ``Base.metadata`` is fully
populated before Alembic inspects it.
"""
# ruff: noqa: F401

from __future__ import annotations

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

import codebox_orchestrator.agent.infrastructure.orm_models
import codebox_orchestrator.auth.models
import codebox_orchestrator.automation.models
import codebox_orchestrator.box.infrastructure.orm_models
import codebox_orchestrator.integration.github.infrastructure.orm_models
import codebox_orchestrator.llm_profile.models
import codebox_orchestrator.project.models
import codebox_orchestrator.project_settings.models
from codebox_orchestrator.shared.persistence.base import Base

# Alembic Config object (provides access to alembic.ini values).
config = context.config

# If no URL was set via set_main_option (CLI path), use the app config.
if not config.get_main_option("sqlalchemy.url"):
    from codebox_orchestrator.config import settings

    config.set_main_option("sqlalchemy.url", settings.database_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode — emit SQL to stdout."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode with a sync connection."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
