"""Rename agent_templates/agent_template_runs → automations/automation_runs.

Pure DDL: renames tables, indexes, unique constraints, and the scheduler_locks
lock row. No data transforms.

Revision ID: 0003
Revises: 0002
Create Date: 2026-04-23
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from alembic import op

if TYPE_CHECKING:
    from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Rename tables first so subsequent ALTER INDEX / ALTER CONSTRAINT see the
    # new names. Postgres rewrites dependent FKs automatically.
    op.rename_table("agent_templates", "automations")
    op.rename_table("agent_template_runs", "automation_runs")

    # Rename FK column template_id → automation_id
    op.alter_column("automation_runs", "template_id", new_column_name="automation_id")

    # Rename indexes (Postgres; matches existing migration style).
    op.execute("ALTER INDEX ix_agent_templates_project_id RENAME TO ix_automations_project_id")
    op.execute(
        "ALTER INDEX ix_agent_templates_project_enabled RENAME TO ix_automations_project_enabled"
    )
    op.execute("ALTER INDEX ix_agent_templates_trigger_kind RENAME TO ix_automations_trigger_kind")
    op.execute("ALTER INDEX ix_agent_templates_next_run_at RENAME TO ix_automations_next_run_at")
    op.execute(
        "ALTER INDEX ix_agent_template_runs_template RENAME TO ix_automation_runs_automation"
    )
    op.execute("ALTER INDEX ix_agent_template_runs_event RENAME TO ix_automation_runs_event")
    op.execute("ALTER INDEX ix_agent_template_runs_project RENAME TO ix_automation_runs_project")

    # Rename unique constraint
    op.execute(
        "ALTER TABLE automations RENAME CONSTRAINT "
        "uq_agent_templates_project_name TO uq_automations_project_name"
    )

    # Update the scheduler lock row name
    op.execute(
        "UPDATE scheduler_locks SET name = 'automation_scheduler' "
        "WHERE name = 'agent_template_scheduler'"
    )


def downgrade() -> None:
    op.execute(
        "UPDATE scheduler_locks SET name = 'agent_template_scheduler' "
        "WHERE name = 'automation_scheduler'"
    )

    op.execute(
        "ALTER TABLE automations RENAME CONSTRAINT "
        "uq_automations_project_name TO uq_agent_templates_project_name"
    )

    op.execute("ALTER INDEX ix_automation_runs_project RENAME TO ix_agent_template_runs_project")
    op.execute("ALTER INDEX ix_automation_runs_event RENAME TO ix_agent_template_runs_event")
    op.execute(
        "ALTER INDEX ix_automation_runs_automation RENAME TO ix_agent_template_runs_template"
    )
    op.execute("ALTER INDEX ix_automations_next_run_at RENAME TO ix_agent_templates_next_run_at")
    op.execute("ALTER INDEX ix_automations_trigger_kind RENAME TO ix_agent_templates_trigger_kind")
    op.execute(
        "ALTER INDEX ix_automations_project_enabled RENAME TO ix_agent_templates_project_enabled"
    )
    op.execute("ALTER INDEX ix_automations_project_id RENAME TO ix_agent_templates_project_id")

    op.alter_column("automation_runs", "automation_id", new_column_name="template_id")

    op.rename_table("automation_runs", "agent_template_runs")
    op.rename_table("automations", "agent_templates")
