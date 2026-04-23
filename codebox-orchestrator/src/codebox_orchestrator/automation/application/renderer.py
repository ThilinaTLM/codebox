"""Prompt renderer: ${{VAR_NAME}} substitution over a flat variables map."""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from collections.abc import Mapping

logger = logging.getLogger(__name__)


_PATTERN = re.compile(r"\$\{\{\s*([A-Z0-9_]+)\s*\}\}")

# Cap rendered prompts at 50 KB. Enforced on initial_prompt; system prompt at 16 KB is a
# pre-render cap handled at the schema layer.
MAX_RENDERED_BYTES = 50 * 1024


@dataclass(frozen=True)
class RenderResult:
    """Result of rendering a template with a variables map.

    ``text`` is the interpolated string; ``unresolved`` is the
    order-stable, de-duplicated list of ``${{NAME}}`` tokens that the
    variables map did not cover.
    """

    text: str
    unresolved: list[str] = field(default_factory=list)


class PromptRenderer:
    """Stateless ${{VAR}} substitution."""

    def render(self, template: str, variables: Mapping[str, str]) -> RenderResult:
        if not template:
            return RenderResult(text=template, unresolved=[])
        seen_unknown: list[str] = []
        unknown_set: set[str] = set()

        def sub(match: re.Match[str]) -> str:
            key = match.group(1)
            if key not in variables:
                if key not in unknown_set:
                    unknown_set.add(key)
                    seen_unknown.append(key)
                    logger.warning("unknown template variable %s", key)
                return match.group(0)
            return variables[key]

        rendered = _PATTERN.sub(sub, template)
        encoded = rendered.encode("utf-8")
        if len(encoded) > MAX_RENDERED_BYTES:
            truncated = encoded[:MAX_RENDERED_BYTES].decode("utf-8", errors="ignore")
            rendered = truncated + "\n\n[... truncated ...]"
        return RenderResult(text=rendered, unresolved=seen_unknown)
