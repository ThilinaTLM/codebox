"""TemplateContext — shared shape returned by every context builder."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class TemplateContext:
    """Resolved event context passed to matcher, renderer, and spawn logic."""

    trigger_kind: str
    variables: dict[str, str] = field(default_factory=dict)
    """Flat UPPER_CASE → string map consumed by the renderer."""

    match_fields: dict[str, Any] = field(default_factory=dict)
    """Typed field values consumed by the matcher."""

    # Non-variable metadata used during box creation
    repo: str | None = None
    branch_hint: str | None = None
    issue_number: int | None = None
    integration_id: str | None = None
    trigger_url: str | None = None
