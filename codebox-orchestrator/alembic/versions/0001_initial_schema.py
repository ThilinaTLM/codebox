"""Initial schema.

Revision ID: 0001
Revises:
Create Date: 2026-04-16
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import sqlalchemy as sa
from alembic import op

if TYPE_CHECKING:
    from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


user_status = sa.Enum("active", "disabled", "deleted", name="user_status")
project_status = sa.Enum("active", "archived", "deleted", name="project_status")


def upgrade() -> None:
    # ── users ────────────────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("username", sa.String(255), nullable=False),
        sa.Column("password_hash", sa.String(512), nullable=False),
        sa.Column("user_type", sa.String(20), nullable=False),
        sa.Column("status", user_status, nullable=False, server_default="active"),
        sa.Column("first_name", sa.String(255), nullable=True),
        sa.Column("last_name", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "uq_users_username_active",
        "users",
        ["username"],
        unique=True,
        postgresql_where=sa.text("status != 'deleted'"),
    )

    # ── projects ─────────────────────────────────────────────────
    op.create_table(
        "projects",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_by", sa.String(36), nullable=False),
        sa.Column("status", project_status, nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="RESTRICT"),
    )
    op.create_index(
        "uq_projects_name_visible",
        "projects",
        ["name"],
        unique=True,
        postgresql_where=sa.text("status != 'deleted'"),
    )
    op.create_index(
        "uq_projects_slug_visible",
        "projects",
        ["slug"],
        unique=True,
        postgresql_where=sa.text("status != 'deleted'"),
    )

    # ── project_members ──────────────────────────────────────────
    op.create_table(
        "project_members",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("project_id", sa.String(36), nullable=False),
        sa.Column("user_id", sa.String(36), nullable=False),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("project_id", "user_id", name="uq_project_members_project_user"),
    )
    op.create_index("ix_project_members_project_id", "project_members", ["project_id"])
    op.create_index("ix_project_members_user_id", "project_members", ["user_id"])

    # ── llm_profiles ─────────────────────────────────────────────
    op.create_table(
        "llm_profiles",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("project_id", sa.String(36), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("provider", sa.String(50), nullable=False),
        sa.Column("model", sa.String(255), nullable=False),
        sa.Column("api_key_enc", sa.Text(), nullable=False),
        sa.Column("base_url", sa.String(512), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_llm_profiles_project_id", "llm_profiles", ["project_id"])
    op.create_index("ix_llm_profiles_deleted_at", "llm_profiles", ["deleted_at"])
    op.create_index(
        "uq_llm_profiles_project_name_active",
        "llm_profiles",
        ["project_id", "name"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )

    # ── project_settings ─────────────────────────────────────────
    op.create_table(
        "project_settings",
        sa.Column("project_id", sa.String(36), primary_key=True),
        sa.Column("default_llm_profile_id", sa.String(36), nullable=True),
        sa.Column("tavily_api_key_enc", sa.Text(), nullable=True),
        sa.Column("github_app_id", sa.String(255), nullable=True),
        sa.Column("github_private_key_enc", sa.Text(), nullable=True),
        sa.Column("github_webhook_secret_enc", sa.Text(), nullable=True),
        sa.Column("github_app_slug", sa.String(255), nullable=True),
        sa.Column("github_bot_name", sa.String(255), nullable=True),
        sa.Column("github_default_base_branch", sa.String(255), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["default_llm_profile_id"], ["llm_profiles.id"], ondelete="SET NULL"
        ),
    )

    # ── boxes ────────────────────────────────────────────────────
    op.create_table(
        "boxes",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("project_id", sa.String(36), nullable=False),
        sa.Column("created_by", sa.String(36), nullable=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("tags_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("provider", sa.String(50), nullable=False),
        sa.Column("model", sa.String(255), nullable=False),
        sa.Column("trigger", sa.String(80), nullable=True),
        sa.Column("github_repo", sa.String(255), nullable=True),
        sa.Column("github_branch", sa.String(255), nullable=True),
        sa.Column("github_issue_number", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_boxes_project_id", "boxes", ["project_id"])
    op.create_index("ix_boxes_deleted_at", "boxes", ["deleted_at"])

    # ── box_events ───────────────────────────────────────────────
    op.create_table(
        "box_events",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("project_id", sa.String(36), nullable=False),
        sa.Column("box_id", sa.String(36), nullable=False),
        sa.Column("seq", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(120), nullable=False),
        sa.Column("event_id", sa.String(80), nullable=False),
        sa.Column("timestamp_ms", sa.BigInteger(), nullable=False),
        sa.Column("run_id", sa.String(80), nullable=True),
        sa.Column("turn_id", sa.String(80), nullable=True),
        sa.Column("message_id", sa.String(80), nullable=True),
        sa.Column("tool_call_id", sa.String(80), nullable=True),
        sa.Column("command_id", sa.String(80), nullable=True),
        sa.Column("payload_json", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["box_id"], ["boxes.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("box_id", "seq", name="uq_box_events_box_seq"),
    )
    op.create_index("ix_box_events_project_id", "box_events", ["project_id"])
    op.create_index("ix_box_events_box_id", "box_events", ["box_id"])
    op.create_index("ix_box_events_kind", "box_events", ["kind"])
    op.create_index("ix_box_events_event_id", "box_events", ["event_id"])
    op.create_index("ix_box_events_run_id", "box_events", ["run_id"])

    # ── box_projections ──────────────────────────────────────────
    op.create_table(
        "box_projections",
        sa.Column("box_id", sa.String(36), primary_key=True),
        sa.Column("project_id", sa.String(36), nullable=False),
        sa.Column("last_seq", sa.Integer(), nullable=False),
        sa.Column("activity", sa.String(80), nullable=True),
        sa.Column("box_outcome", sa.String(80), nullable=True),
        sa.Column("box_outcome_message", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["box_id"], ["boxes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_box_projections_project_id", "box_projections", ["project_id"])

    # ── github_installations ─────────────────────────────────────
    op.create_table(
        "github_installations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("project_id", sa.String(36), nullable=False),
        sa.Column("installation_id", sa.Integer(), nullable=False),
        sa.Column("account_login", sa.String(255), nullable=False),
        sa.Column("account_type", sa.String(50), nullable=False),
        sa.Column("settings", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("project_id", "installation_id", name="uq_gh_inst_project_install"),
    )
    op.create_index("ix_github_installations_project_id", "github_installations", ["project_id"])
    op.create_index(
        "ix_github_installations_installation_id",
        "github_installations",
        ["installation_id"],
    )

    # ── github_events ────────────────────────────────────────────
    # Note: box_id column intentionally omitted — fan-out to 0..N boxes is
    # captured via agent_template_runs instead.
    op.create_table(
        "github_events",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("project_id", sa.String(36), nullable=False),
        sa.Column("delivery_id", sa.String(255), nullable=False),
        sa.Column("event_type", sa.String(100), nullable=False),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("repository", sa.String(255), nullable=False),
        sa.Column("payload", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_github_events_project_id", "github_events", ["project_id"])
    op.create_index("ix_github_events_delivery_id", "github_events", ["delivery_id"], unique=True)

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


def downgrade() -> None:
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

    op.drop_index("ix_github_events_delivery_id", table_name="github_events")
    op.drop_index("ix_github_events_project_id", table_name="github_events")
    op.drop_table("github_events")

    op.drop_index("ix_github_installations_installation_id", table_name="github_installations")
    op.drop_index("ix_github_installations_project_id", table_name="github_installations")
    op.drop_table("github_installations")

    op.drop_index("ix_box_projections_project_id", table_name="box_projections")
    op.drop_table("box_projections")

    op.drop_index("ix_box_events_run_id", table_name="box_events")
    op.drop_index("ix_box_events_event_id", table_name="box_events")
    op.drop_index("ix_box_events_kind", table_name="box_events")
    op.drop_index("ix_box_events_box_id", table_name="box_events")
    op.drop_index("ix_box_events_project_id", table_name="box_events")
    op.drop_table("box_events")

    op.drop_index("ix_boxes_deleted_at", table_name="boxes")
    op.drop_index("ix_boxes_project_id", table_name="boxes")
    op.drop_table("boxes")

    op.drop_table("project_settings")

    op.drop_index("uq_llm_profiles_project_name_active", table_name="llm_profiles")
    op.drop_index("ix_llm_profiles_deleted_at", table_name="llm_profiles")
    op.drop_index("ix_llm_profiles_project_id", table_name="llm_profiles")
    op.drop_table("llm_profiles")

    op.drop_index("ix_project_members_user_id", table_name="project_members")
    op.drop_index("ix_project_members_project_id", table_name="project_members")
    op.drop_table("project_members")

    op.drop_index("uq_projects_slug_visible", table_name="projects")
    op.drop_index("uq_projects_name_visible", table_name="projects")
    op.drop_table("projects")

    op.drop_index("uq_users_username_active", table_name="users")
    op.drop_table("users")

    project_status.drop(op.get_bind(), checkfirst=False)
    user_status.drop(op.get_bind(), checkfirst=False)
