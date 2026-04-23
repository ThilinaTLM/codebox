"""Per-trigger-kind allowed filter fields, valid actions, and field types.

This is the single source of truth consumed by:

- the service layer (create/update validation of filter predicates and
  ``trigger_actions``)
- the matcher (evaluating predicates against ``TemplateContext.match_fields``)
- the dispatcher / scheduler (the structural action gate)
- the UI (mirrored in ``codebox-web-ui/src/components/settings/automation/metadata.ts``)

``repo`` and ``action`` are **not** filter fields: repo is structural
(``Automation.trigger_repo``) and action is structural
(``Automation.trigger_actions``). Keep them out of ``ALLOWED_FIELDS``.
"""

from __future__ import annotations

from typing import Literal

FieldType = Literal["string", "list", "bool", "int"]


# Map: trigger_kind -> {field_name: field_type}
ALLOWED_FIELDS: dict[str, dict[str, FieldType]] = {
    "github.issues": {
        "labels": "list",
        "author": "string",
        "title": "string",
    },
    "github.issue_comment": {
        "labels": "list",
        "author": "string",
        "comment_author": "string",
        "comment_body": "string",
        "is_pr": "bool",
    },
    "github.pull_request": {
        "labels": "list",
        "author": "string",
        "title": "string",
        "base_ref": "string",
        "head_ref": "string",
        "draft": "bool",
    },
    "github.pull_request_review": {
        "author": "string",
        "review_state": "string",
        "review_body": "string",
    },
    "github.pull_request_review_comment": {
        "pr_author": "string",
        "comment_author": "string",
        "comment_body": "string",
    },
    "github.push": {
        "branch": "string",
        "tag": "string",
        "pusher": "string",
        "commit_count": "int",
        "forced": "bool",
        "created": "bool",
        "deleted": "bool",
    },
    "schedule": {},
}


# Ops valid per field type. ``contains_any`` is only valid for lists.
OPS_BY_FIELD_TYPE: dict[FieldType, set[str]] = {
    "string": {"eq", "in", "matches"},
    "list": {"eq", "in", "contains_any", "matches"},
    "bool": {"eq"},
    "int": {"eq", "in"},
}


# GitHub action strings this project recognises, per trigger kind.
#
# - ``github.push`` is intentionally empty: push webhooks have no ``action``
#   field, and ``Automation.trigger_actions`` must be ``None`` for push.
# - ``schedule`` is intentionally empty for the same reason.
#
# Any GitHub kind with a non-empty set here requires a non-empty
# ``trigger_actions`` subset at create/update time.
VALID_ACTIONS: dict[str, frozenset[str]] = {
    "github.issues": frozenset(
        {
            "opened",
            "closed",
            "reopened",
            "edited",
            "labeled",
            "unlabeled",
            "assigned",
            "unassigned",
            "pinned",
            "unpinned",
        }
    ),
    "github.issue_comment": frozenset({"created", "edited", "deleted"}),
    "github.pull_request": frozenset(
        {
            "opened",
            "closed",
            "reopened",
            "edited",
            "ready_for_review",
            "synchronize",
            "labeled",
            "unlabeled",
            "review_requested",
            "review_request_removed",
        }
    ),
    "github.pull_request_review": frozenset({"submitted", "edited", "dismissed"}),
    "github.pull_request_review_comment": frozenset({"created", "edited", "deleted"}),
    "github.push": frozenset(),
    "schedule": frozenset(),
}


def allowed_fields_for(trigger_kind: str) -> dict[str, FieldType]:
    """Return the allowed field→type map for *trigger_kind* (empty if unknown)."""
    return ALLOWED_FIELDS.get(trigger_kind, {})


def valid_ops_for(field_type: FieldType) -> set[str]:
    """Return the set of filter operators valid for *field_type*."""
    return OPS_BY_FIELD_TYPE.get(field_type, set())


def valid_actions_for(trigger_kind: str) -> frozenset[str]:
    """Return the set of recognised actions for *trigger_kind* (empty if none)."""
    return VALID_ACTIONS.get(trigger_kind, frozenset())


def trigger_kind_has_actions(trigger_kind: str) -> bool:
    """True when this kind requires a non-empty ``trigger_actions``.

    False for ``schedule`` and ``github.push`` (both have no action field).
    """
    return bool(VALID_ACTIONS.get(trigger_kind))
