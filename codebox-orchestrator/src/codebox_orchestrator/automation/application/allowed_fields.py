"""Per-trigger-kind allowed filter fields and field types.

This single source of truth is consumed by:

- the service layer (02) for validation of create/update predicates
- the matcher (04) to evaluate predicates against TemplateContext.match_fields
- the UI (06) as a static reference for the filter builder
"""

from __future__ import annotations

from typing import Literal

FieldType = Literal["string", "list", "bool", "int"]


# Map: trigger_kind -> {field_name: field_type}
ALLOWED_FIELDS: dict[str, dict[str, FieldType]] = {
    "github.issues": {
        "repo": "string",
        "action": "string",
        "labels": "list",
        "author": "string",
        "title": "string",
        "state": "string",
    },
    "github.issue_comment": {
        "repo": "string",
        "action": "string",
        "labels": "list",
        "author": "string",
        "comment_author": "string",
        "comment_body": "string",
        "is_pr": "bool",
    },
    "github.pull_request": {
        "repo": "string",
        "action": "string",
        "labels": "list",
        "author": "string",
        "title": "string",
        "base_ref": "string",
        "head_ref": "string",
        "draft": "bool",
    },
    "github.pull_request_review": {
        "repo": "string",
        "action": "string",
        "author": "string",
        "review_state": "string",
        "review_body": "string",
    },
    "github.pull_request_review_comment": {
        "repo": "string",
        "action": "string",
        "pr_author": "string",
        # ``author`` is a deprecated alias for ``pr_author``. Kept so
        # automations authored before the rename continue to validate.
        "author": "string",
        "comment_author": "string",
        "comment_body": "string",
    },
    "github.push": {
        "repo": "string",
        "ref": "string",
        "branch": "string",
        "tag": "string",
        "pusher": "string",
        "commit_count": "int",
        "forced": "bool",
        "created": "bool",
        "deleted": "bool",
    },
    "schedule": {
        "repo": "string",
    },
}


# Ops valid per field type. ``contains_any`` is only valid for lists.
OPS_BY_FIELD_TYPE: dict[FieldType, set[str]] = {
    "string": {"eq", "in", "matches"},
    "list": {"eq", "in", "contains_any", "matches"},
    "bool": {"eq"},
    "int": {"eq", "in"},
}


def allowed_fields_for(trigger_kind: str) -> dict[str, FieldType]:
    """Return the allowed field→type map for *trigger_kind* (empty if unknown)."""
    return ALLOWED_FIELDS.get(trigger_kind, {})


def valid_ops_for(field_type: FieldType) -> set[str]:
    """Return the set of filter operators valid for *field_type*."""
    return OPS_BY_FIELD_TYPE.get(field_type, set())
