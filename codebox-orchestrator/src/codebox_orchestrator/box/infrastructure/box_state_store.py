"""In-memory store for box lifecycle state not captured by Docker.

Tracks boxes from creation until Docker takes over (spawn success),
and records error details for any box that fails during startup.
"""

from __future__ import annotations

from dataclasses import replace
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from codebox_orchestrator.box.domain.views import BoxView


class BoxStateStore:
    """Tracks box state for boxes not yet visible in Docker."""

    def __init__(self) -> None:
        self._pending: dict[str, BoxView] = {}  # Boxes not yet in Docker
        self._errors: dict[str, str] = {}  # box_id → error detail

    def register(self, view: BoxView) -> None:
        """Track a newly created box."""
        self._pending[view.id] = view

    def mark_spawned(self, box_id: str) -> None:
        """Box container created successfully — Docker takes over."""
        self._pending.pop(box_id, None)

    def set_error(self, box_id: str, error_detail: str) -> None:
        """Mark a box as failed with an error detail."""
        self._errors[box_id] = error_detail
        if box_id in self._pending:
            self._pending[box_id] = replace(
                self._pending[box_id],
                container_status="stopped",
                error_detail=error_detail,
            )

    def get_error(self, box_id: str) -> str | None:
        """Get the error detail for a box, if any."""
        return self._errors.get(box_id)

    def get_pending(self, box_id: str) -> BoxView | None:
        """Get a tracked box (pending or failed spawn)."""
        return self._pending.get(box_id)

    def all_pending(self) -> list[BoxView]:
        """Get all tracked boxes not yet in Docker."""
        return list(self._pending.values())

    def remove(self, box_id: str) -> None:
        """Remove all tracking for a box (e.g. on deletion)."""
        self._pending.pop(box_id, None)
        self._errors.pop(box_id, None)
