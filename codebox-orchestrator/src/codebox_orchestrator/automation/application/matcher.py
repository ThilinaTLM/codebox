"""Predicate evaluator for Automation.trigger_filters."""

from __future__ import annotations

import logging
import re
from typing import TYPE_CHECKING, Any

from codebox_orchestrator.automation.application.allowed_fields import (
    allowed_fields_for,
)

if TYPE_CHECKING:
    from codebox_orchestrator.automation.application.context import TemplateContext

logger = logging.getLogger(__name__)


class AutomationMatcher:
    """Stateless AND-predicate evaluator over TemplateContext.match_fields."""

    def matches(
        self,
        predicates: list[dict[str, Any]] | None,
        context: TemplateContext,
    ) -> tuple[bool, str | None]:
        """Return (matched, reason_on_miss).

        The predicate list was already validated at service-layer time against
        the allowed-fields table. If we encounter an unknown field at runtime
        we log and treat as no-match.
        """
        if not predicates:
            return True, None

        allowed = allowed_fields_for(context.trigger_kind)

        for pred in predicates:
            field_name = pred.get("field")
            op = pred.get("op")
            value = pred.get("value")
            if field_name is None or op is None:
                logger.warning("malformed predicate: %r", pred)
                return False, f"malformed predicate: {pred!r}"
            if field_name not in allowed:
                logger.warning(
                    "unknown predicate field %s for trigger %s",
                    field_name,
                    context.trigger_kind,
                )
                return False, f"unknown field '{field_name}'"
            field_type = allowed[field_name]
            observed = context.match_fields.get(field_name)
            if observed is None:
                observed = [] if field_type == "list" else ""
            if not _eval(op, field_type, observed, value):
                return False, f"predicate failed: {field_name} {op} {value!r}"
        return True, None


def _eval(op: str, field_type: str, observed: Any, value: Any) -> bool:
    if op == "eq":
        return _eq(field_type, observed, value)
    if op == "in":
        return _in(field_type, observed, value)
    if op == "contains_any":
        return _contains_any(field_type, observed, value)
    if op == "matches":
        return _matches(field_type, observed, value)
    logger.warning("unknown op %s", op)
    return False


def _lower(value: Any) -> Any:
    if isinstance(value, str):
        return value.lower()
    if isinstance(value, list):
        return [v.lower() if isinstance(v, str) else v for v in value]
    return value


def _eq(field_type: str, observed: Any, value: Any) -> bool:
    if field_type == "list":
        if not isinstance(value, list):
            return False
        return _lower(observed) == _lower(value)
    if field_type == "bool":
        if isinstance(value, str):
            value = value.lower() in {"true", "1", "yes"}
        return bool(observed) == bool(value)
    if field_type == "int":
        try:
            return int(observed) == int(value)  # type: ignore[arg-type]
        except (TypeError, ValueError):
            return False
    return _lower(observed) == _lower(value)


def _in(field_type: str, observed: Any, value: Any) -> bool:  # noqa: PLR0911
    if not isinstance(value, list):
        return False
    if field_type == "list":
        obs_lower = _lower(observed)
        val_lower = _lower(value)
        if not isinstance(obs_lower, list):
            return False
        return any(v in obs_lower for v in val_lower)
    if field_type == "int":
        try:
            obs_int = int(observed)
        except (TypeError, ValueError):
            return False
        for v in value:
            try:
                if obs_int == int(v):
                    return True
            except (TypeError, ValueError):
                continue
        return False
    obs_str = _lower(observed)
    val_list = _lower(value)
    return obs_str in val_list


def _contains_any(field_type: str, observed: Any, value: Any) -> bool:
    # Only valid for list-typed fields (validator enforced).
    if field_type != "list":
        return False
    if not isinstance(value, list) or not isinstance(observed, list):
        return False
    obs_lower = _lower(observed)
    val_lower = _lower(value)
    return any(v in obs_lower for v in val_lower)  # type: ignore[operator]


def _matches(field_type: str, observed: Any, value: Any) -> bool:
    if not isinstance(value, str):
        return False
    try:
        pattern = re.compile(value)
    except re.error:
        return False
    if field_type == "list":
        if not isinstance(observed, list):
            return False
        return any(pattern.search(str(v)) for v in observed)
    return pattern.search(str(observed)) is not None
