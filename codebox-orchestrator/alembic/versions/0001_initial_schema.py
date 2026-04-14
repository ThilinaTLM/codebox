"""Initial schema.

Revision ID: 0001
Revises:
Create Date: 2025-04-14
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


def upgrade() -> None:
    # ── users ────────────────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("username", sa.String(255), nullable=False),
        sa.Column("password_hash", sa.String(512), nullable=False),
        sa.Column("user_type", sa.String(20), nullable=False),
        sa.Column("first_name", sa.String(255), nullable=True),
        sa.Column("last_name", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_users_username", "users", ["username"], unique=True)

    # ── box_events ───────────────────────────────────────────────
    op.create_table(
        "box_events",
        sa.Column("id", sa.String(36), primary_key=True),
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
        sa.UniqueConstraint("box_id", "seq", name="uq_box_events_box_seq"),
    )
    op.create_index("ix_box_events_box_id", "box_events", ["box_id"])
    op.create_index("ix_box_events_kind", "box_events", ["kind"])
    op.create_index("ix_box_events_event_id", "box_events", ["event_id"])
    op.create_index("ix_box_events_run_id", "box_events", ["run_id"])

    # ── box_projections ──────────────────────────────────────────
    op.create_table(
        "box_projections",
        sa.Column("box_id", sa.String(36), primary_key=True),
        sa.Column("last_seq", sa.Integer(), nullable=False),
        sa.Column("activity", sa.String(80), nullable=True),
        sa.Column("task_outcome", sa.String(80), nullable=True),
        sa.Column("task_outcome_message", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    # ── github_installations ─────────────────────────────────────
    op.create_table(
        "github_installations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), nullable=False),
        sa.Column("installation_id", sa.Integer(), nullable=False),
        sa.Column("account_login", sa.String(255), nullable=False),
        sa.Column("account_type", sa.String(50), nullable=False),
        sa.Column("settings", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "installation_id", name="uq_gh_inst_user_install"),
    )
    op.create_index("ix_github_installations_user_id", "github_installations", ["user_id"])
    op.create_index(
        "ix_github_installations_installation_id",
        "github_installations",
        ["installation_id"],
    )

    # ── github_events ────────────────────────────────────────────
    op.create_table(
        "github_events",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), nullable=False),
        sa.Column("delivery_id", sa.String(255), nullable=False),
        sa.Column("event_type", sa.String(100), nullable=False),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("repository", sa.String(255), nullable=False),
        sa.Column("payload", sa.Text(), nullable=False),
        sa.Column("box_id", sa.String(36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_github_events_user_id", "github_events", ["user_id"])
    op.create_index("ix_github_events_delivery_id", "github_events", ["delivery_id"], unique=True)

    # ── llm_profiles ─────────────────────────────────────────────
    op.create_table(
        "llm_profiles",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("provider", sa.String(50), nullable=False),
        sa.Column("model", sa.String(255), nullable=False),
        sa.Column("api_key_enc", sa.Text(), nullable=False),
        sa.Column("base_url", sa.String(512), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "name", name="uq_llm_profiles_user_name"),
    )
    op.create_index("ix_llm_profiles_user_id", "llm_profiles", ["user_id"])

    # ── user_settings ────────────────────────────────────────────
    op.create_table(
        "user_settings",
        sa.Column("user_id", sa.String(36), primary_key=True),
        sa.Column("default_llm_profile_id", sa.String(36), nullable=True),
        sa.Column("tavily_api_key_enc", sa.Text(), nullable=True),
        sa.Column("github_app_id", sa.String(255), nullable=True),
        sa.Column("github_private_key_enc", sa.Text(), nullable=True),
        sa.Column("github_webhook_secret_enc", sa.Text(), nullable=True),
        sa.Column("github_app_slug", sa.String(255), nullable=True),
        sa.Column("github_bot_name", sa.String(255), nullable=True),
        sa.Column("github_default_base_branch", sa.String(255), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("user_settings")
    op.drop_table("llm_profiles")
    op.drop_table("github_events")
    op.drop_table("github_installations")
    op.drop_table("box_projections")
    op.drop_table("box_events")
    op.drop_table("users")
