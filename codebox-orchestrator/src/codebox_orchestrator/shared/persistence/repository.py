"""Shared persistence helpers for repositories.

Two patterns repeat across the soft-deletable repositories
(``box.infrastructure.box_repository.BoxRepository``,
``llm_profile.repository.LLMProfileRepository``):

1. **Soft-delete filter** — every read query needs
   ``.where(Model.deleted_at.is_(None))`` unless the caller asks for
   deleted rows.
2. **Soft-delete mutation** — set ``deleted_at`` and ``updated_at`` to
   the same UTC ``datetime.now()``.

This module exposes the two helpers as static methods on
:class:`SoftDeleteMixin`. Repositories opt in by inheriting and using the
helpers; nothing about the session lifecycle is taken away from the
repository.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from sqlalchemy.sql import Select


class SoftDeleteMixin:
    """Helpers for ORM models that have ``deleted_at`` and ``updated_at`` columns."""

    @staticmethod
    def apply_soft_delete_filter(
        stmt: Select[Any], model_cls: type[Any], *, include_deleted: bool = False
    ) -> Select[Any]:
        """Return ``stmt`` extended with ``.where(model.deleted_at.is_(None))``.

        Pass ``include_deleted=True`` to skip the filter (e.g. admin views).
        """
        if include_deleted:
            return stmt
        return stmt.where(model_cls.deleted_at.is_(None))

    @staticmethod
    def mark_soft_deleted(entity: Any) -> None:
        """Set ``deleted_at`` and ``updated_at`` to ``datetime.now(UTC)``."""
        now = datetime.now(UTC)
        entity.deleted_at = now
        entity.updated_at = now


__all__ = ["SoftDeleteMixin"]
