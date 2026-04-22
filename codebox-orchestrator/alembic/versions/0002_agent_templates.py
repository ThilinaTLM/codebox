"""Agent templates, template runs, scheduler locks.

Revision ID: 0002
Revises: 0001
Create Date: 2026-04-22
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import sqlalchemy as sa
from alembic import op

if TYPE_CHECKING:
    from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ── agent_templates ──────────────────────────────────────────
    op.create_table(
        "agent_templates",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("project_id", sa.String(36), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("trigger_kind", sa.String(32), nullable=False),
        sa.Column("trigger_filters", sa.JSON(), nullable=True),
        sa.Column("schedule_cron", sa.String(64), nullable=True),
        sa.Column("schedule_timezone", sa.String(64), nullable=True),
        sa.Column("next_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("workspace_mode", sa.String(32), nullable=False),
        sa.Column("pinned_repo", sa.String(255), nullable=True),
        sa.Column("pinned_branch", sa.String(255), nullable=True),
        sa.Column("system_prompt", sa.Text(), nullable=True),
        sa.Column("initial_prompt", sa.Text(), nullable=False),
        sa.Column("llm_profile_id", sa.String(36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.String(36), nullable=True),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["llm_profile_id"], ["llm_profiles.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("project_id", "name", name="uq_agent_templates_project_name"),
    )
    op.create_index("ix_agent_templates_project_id", "agent_templates", ["project_id"])
    op.create_index(
        "ix_agent_templates_project_enabled",
        "agent_templates",
        ["project_id", "enabled"],
    )
    op.create_index(
        "ix_agent_templates_trigger_kind",
        "agent_templates",
        ["project_id", "trigger_kind"],
    )
    op.create_index("ix_agent_templates_next_run_at", "agent_templates", ["next_run_at"])

    # ── agent_template_runs ──────────────────────────────────────
    op.create_table(
        "agent_template_runs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("project_id", sa.String(36), nullable=False),
        sa.Column("template_id", sa.String(36), nullable=False),
        sa.Column("box_id", sa.String(36), nullable=True),
        sa.Column("github_event_id", sa.String(36), nullable=True),
        sa.Column("trigger_kind", sa.String(32), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["template_id"], ["agent_templates.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["box_id"], ["boxes.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["github_event_id"], ["github_events.id"], ondelete="SET NULL"),
    )
    op.create_index(
        "ix_agent_template_runs_template",
        "agent_template_runs",
        ["template_id", "created_at"],
    )
    op.create_index(
        "ix_agent_template_runs_event",
        "agent_template_runs",
        ["github_event_id"],
    )
    op.create_index(
        "ix_agent_template_runs_project",
        "agent_template_runs",
        ["project_id", "created_at"],
    )

    # ── scheduler_locks ──────────────────────────────────────────
    scheduler_locks = op.create_table(
        "scheduler_locks",
        sa.Column("name", sa.String(64), primary_key=True),
        sa.Column("holder", sa.String(64), nullable=True),
        sa.Column("acquired_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("heartbeat_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.bulk_insert(scheduler_locks, [{"name": "agent_template_scheduler"}])

    # ── github_events: drop the old single-box_id column ─────────
    # The join table agent_template_runs captures 0..N boxes per event.
    op.drop_index("ix_github_events_box_id", table_name="github_events")
    op.drop_constraint("github_events_box_id_fkey", "github_events", type_="foreignkey")
    op.drop_column("github_events", "box_id")


def downgrade() -> None:
    op.add_column(
        "github_events",
        sa.Column("box_id", sa.String(36), nullable=True),
    )
    op.create_foreign_key(
        "github_events_box_id_fkey",
        "github_events",
        "boxes",
        ["box_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_github_events_box_id", "github_events", ["box_id"])

    op.drop_table("scheduler_locks")

    op.drop_index("ix_agent_template_runs_project", table_name="agent_template_runs")
    op.drop_index("ix_agent_template_runs_event", table_name="agent_template_runs")
    op.drop_index("ix_agent_template_runs_template", table_name="agent_template_runs")
    op.drop_table("agent_template_runs")

    op.drop_index("ix_agent_templates_next_run_at", table_name="agent_templates")
    op.drop_index("ix_agent_templates_trigger_kind", table_name="agent_templates")
    op.drop_index("ix_agent_templates_project_enabled", table_name="agent_templates")
    op.drop_index("ix_agent_templates_project_id", table_name="agent_templates")
    op.drop_table("agent_templates")
