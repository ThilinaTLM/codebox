"""Shared test fakes used across orchestrator unit tests.

Currently exports the minimal common surface:

- ``FakeProfile`` — value object matching ``ResolvedProfile``.
- ``FakeProfileService`` — implements ``resolve_profile``.
- ``FakeSettingsService`` — implements
  ``get_default_profile_id`` and ``get_tavily_api_key``.

Both fakes are configurable (no profile / Tavily failure) so the same
class works for happy-path and failure-mode tests.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class FakeProfile:
    """Resolved-profile stand-in (matches the ``ResolvedProfile`` shape)."""

    provider: str = "anthropic"
    model: str = "claude-3-5-sonnet"
    api_key: str = "sk-test"  # pragma: allowlist secret
    base_url: str | None = None


class FakeProfileService:
    """Stand-in for ``LLMProfileService.resolve_profile``."""

    def __init__(self, *, found: bool = True, profile: FakeProfile | None = None) -> None:
        self._found = found
        self._profile = profile or FakeProfile()

    async def resolve_profile(self, profile_id: str, project_id: str) -> FakeProfile | None:
        return self._profile if self._found else None


class FakeSettingsService:
    """Stand-in for ``ProjectSettingsService`` (default-profile + tavily key)."""

    def __init__(
        self,
        *,
        default_profile: str | None = "prof-default",
        tavily_raises: bool = False,
        tavily_key: str | None = None,
    ) -> None:
        self._default = default_profile
        self._tavily_raises = tavily_raises
        self._tavily_key = tavily_key

    async def get_default_profile_id(self, project_id: str) -> str | None:
        return self._default

    async def get_tavily_api_key(self, project_id: str) -> str | None:
        if self._tavily_raises:
            msg = "tavily fetch failed"
            raise RuntimeError(msg)
        return self._tavily_key


__all__ = [
    "FakeProfile",
    "FakeProfileService",
    "FakeSettingsService",
]
