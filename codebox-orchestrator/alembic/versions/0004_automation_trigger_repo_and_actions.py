"""Automation trigger redesign: structural repo + actions.

Adds ``automations.trigger_repo`` (NOT NULL) and ``automations.trigger_actions``
(nullable JSON list); adds ``automation_runs.matched_action`` (nullable).
Backfills from the legacy ``pinned_repo`` column and from any lifted
``repo`` / ``action`` predicates in ``trigger_filters``. Rows for which no
single repo can be inferred are **deleted** \u2014 early-dev, clean
implementation; no soft-disable.

Revision ID: 0004
Revises: 0003
Create Date: 2026-04-23
"""

from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any

import sqlalchemy as sa
from alembic import op

if TYPE_CHECKING:
    from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# Kind \u2192 default action set when the legacy row had no ``action`` predicate.
# These match the defaults the wizard now seeds automatically.
_DEFAULT_ACTIONS: dict[str, list[str]] = {
    "github.issues": ["opened", "reopened"],
    "github.issue_comment": ["created"],
    "github.pull_request": ["opened", "synchronize", "ready_for_review"],
    "github.pull_request_review": ["submitted"],
    "github.pull_request_review_comment": ["created"],
}

# Fields that must be dropped from every row's ``trigger_filters`` because
# they're structural now or were redundant.
_DROPPED_FIELDS: frozenset[str] = frozenset({"repo", "action", "state", "ref"})


def _coerce_list(raw: Any) -> list[dict[str, Any]]:
    if raw is None:
        return []
    if isinstance(raw, list):
        return list(raw)
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            return []
        return parsed if isinstance(parsed, list) else []
    return []


def _extract_repo(filters: list[dict[str, Any]]) -> str | None:
    repo_preds = [p for p in filters if p.get("field") == "repo"]
    if len(repo_preds) != 1:
        return None
    pred = repo_preds[0]
    if pred.get("op") != "eq":
        return None
    value = pred.get("value")
    if not isinstance(value, str) or "/" not in value:
        return None
    return value


def _extract_actions(filters: list[dict[str, Any]]) -> list[str] | None:
    action_preds = [p for p in filters if p.get("field") == "action"]
    if not action_preds:
        return None
    collected: list[str] = []
    for pred in action_preds:
        op_name = pred.get("op")
        value = pred.get("value")
        if op_name == "eq" and isinstance(value, str):
            collected.append(value)
        elif op_name == "in" and isinstance(value, list):
            collected.extend(str(v) for v in value if isinstance(v, str))
    # de-dup preserving order
    seen: set[str] = set()
    out: list[str] = []
    for a in collected:
        if a not in seen:
            seen.add(a)
            out.append(a)
    return out or None


def _strip_promoted(filters: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [p for p in filters if p.get("field") not in _DROPPED_FIELDS]


def upgrade() -> None:
    bind = op.get_bind()

    # --- 1. Add new columns (nullable first) -------------------------------
    op.add_column(
        "automations",
        sa.Column("trigger_repo", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "automations",
        sa.Column("trigger_actions", sa.JSON(), nullable=True),
    )
    op.add_column(
        "automation_runs",
        sa.Column("matched_action", sa.String(length=64), nullable=True),
    )

    # --- 2. Backfill + clean ``trigger_filters`` ---------------------------
    rows = bind.execute(
        sa.text("SELECT id, trigger_kind, pinned_repo, trigger_filters FROM automations")
    ).fetchall()

    to_delete: list[str] = []

    for row in rows:
        automation_id: str = row[0]
        trigger_kind: str = row[1]
        pinned_repo: str | None = row[2]
        filters = _coerce_list(row[3])

        # Resolve trigger_repo.
        resolved_repo: str | None = pinned_repo
        if not resolved_repo:
            resolved_repo = _extract_repo(filters)
        if not resolved_repo:
            to_delete.append(automation_id)
            continue

        # Resolve trigger_actions.
        if trigger_kind in {"schedule", "github.push"}:
            actions: list[str] | None = None
        else:
            actions = _extract_actions(filters)
            if not actions:
                actions = list(_DEFAULT_ACTIONS.get(trigger_kind, []))

        cleaned_filters = _strip_promoted(filters)
        cleaned_json: str | None = json.dumps(cleaned_filters) if cleaned_filters else None

        bind.execute(
            sa.text(
                "UPDATE automations SET "
                "trigger_repo = :trepo, "
                "trigger_actions = CAST(:tactions AS JSON), "
                "trigger_filters = CAST(:tfilters AS JSON) "
                "WHERE id = :id"
            ),
            {
                "trepo": resolved_repo,
                "tactions": json.dumps(actions) if actions is not None else None,
                "tfilters": cleaned_json,
                "id": automation_id,
            },
        )

    if to_delete:
        # Cascades to automation_runs via FK.
        bind.execute(
            sa.text("DELETE FROM automations WHERE id = ANY(:ids)"),
            {"ids": to_delete},
        )

    # --- 3. NOT NULL + index + drop legacy column --------------------------
    op.alter_column(
        "automations",
        "trigger_repo",
        existing_type=sa.String(length=255),
        nullable=False,
    )
    op.create_index(
        "ix_automations_trigger_repo",
        "automations",
        ["project_id", "trigger_repo"],
    )
    op.drop_column("automations", "pinned_repo")


def downgrade() -> None:  # pragma: no cover - destructive migration
    msg = (
        "0004 is destructive (row deletes, predicate rewrites, column drops); "
        "downgrade is not supported."
    )
    raise NotImplementedError(msg)
