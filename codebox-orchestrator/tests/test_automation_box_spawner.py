"""Unit tests for ``AutomationBoxSpawner``.

Covers the cross-cutting logic shared by the webhook dispatcher and the
scheduler:

- LLM-profile resolution falls back to the project default when the
  automation does not set ``llm_profile_id``.
- Missing-profile failures return an error result instead of raising.
- Render misses are surfaced via ``unresolved_variables``.
- Tavily-key fetch failures are silently ignored.
- ``CreateBoxHandler.execute`` failures bubble up as ``error`` results.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Any

import pytest

from codebox_orchestrator.automation.application.box_spawner import (
    AutomationBoxSpawner,
    SpawnContext,
)
from codebox_orchestrator.automation.application.renderer import PromptRenderer
from tests.helpers import FakeProfileService, FakeSettingsService


@dataclass
class _FakeAutomation:
    id: str = "a-1"
    name: str = "Dev"
    initial_prompt: str = "hello ${{REPO}}"
    system_prompt: str | None = None
    llm_profile_id: str | None = None
    workspace_mode: str = "branch_from_issue"
    trigger_repo: str = "acme/widgets"
    pinned_branch: str | None = None
    trigger_kind: str = "github.issues"


class _RecordingCreateBox:
    def __init__(self, *, fail: bool = False) -> None:
        self.calls: list[dict[str, Any]] = []
        self._fail = fail

    async def execute(self, **kwargs: Any) -> Any:
        if self._fail:
            raise RuntimeError("create_box failed")
        self.calls.append(kwargs)

        @dataclass
        class _View:
            id: str = field(default_factory=lambda: str(uuid.uuid4()))

        return _View()


def _make_spawner(
    *,
    profile_found: bool = True,
    default_profile: str | None = "prof-default",
    tavily_raises: bool = False,
    create_box_fails: bool = False,
) -> tuple[AutomationBoxSpawner, _RecordingCreateBox]:
    create_box = _RecordingCreateBox(fail=create_box_fails)
    spawner = AutomationBoxSpawner(
        profile_service=FakeProfileService(found=profile_found),
        settings_service=FakeSettingsService(
            default_profile=default_profile, tavily_raises=tavily_raises
        ),
        renderer=PromptRenderer(),
        create_box=create_box,
    )
    return spawner, create_box


def _ctx(**overrides: Any) -> SpawnContext:
    base = {
        "project_id": "proj-1",
        "trigger_kind": "github.issues",
        "workspace_mode": "branch_from_issue",
        "box_name": "[Automation:Dev] something",
        "base_repo": "acme/widgets",
        "branch_hint": None,
        "pinned_branch": None,
        "issue_number": 42,
        "trigger_url": "https://github.com/acme/widgets/issues/42",
        "installation": None,
        "variables": {"REPO": "acme/widgets", "ISSUE_TITLE": "Hi"},
    }
    base.update(overrides)
    return SpawnContext(**base)  # type: ignore[arg-type]


@pytest.mark.asyncio
async def test_spawn_uses_default_profile_when_automation_has_none() -> None:
    spawner, create_box = _make_spawner()
    result = await spawner.spawn(_FakeAutomation(llm_profile_id=None), _ctx())
    assert result.succeeded
    assert result.box_id is not None
    assert len(create_box.calls) == 1


@pytest.mark.asyncio
async def test_spawn_returns_error_when_no_profile_available() -> None:
    spawner, create_box = _make_spawner(default_profile=None)
    result = await spawner.spawn(_FakeAutomation(), _ctx())
    assert not result.succeeded
    assert result.box_id is None
    assert result.error is not None
    assert "no LLM profile" in result.error
    assert create_box.calls == []


@pytest.mark.asyncio
async def test_spawn_returns_error_when_profile_missing() -> None:
    spawner, _ = _make_spawner(profile_found=False)
    result = await spawner.spawn(_FakeAutomation(), _ctx())
    assert not result.succeeded
    assert result.error is not None
    assert "missing" in result.error


@pytest.mark.asyncio
async def test_spawn_reports_unresolved_variables() -> None:
    spawner, _ = _make_spawner()
    automation = _FakeAutomation(initial_prompt="repo=${{REPO}} missing=${{NOPE}}")
    result = await spawner.spawn(automation, _ctx())
    assert result.succeeded  # render misses are warnings, not failures
    assert "NOPE" in result.unresolved_variables


@pytest.mark.asyncio
async def test_spawn_silently_ignores_tavily_errors() -> None:
    spawner, create_box = _make_spawner(tavily_raises=True)
    result = await spawner.spawn(_FakeAutomation(), _ctx())
    assert result.succeeded
    assert create_box.calls[0]["tavily_api_key"] is None


@pytest.mark.asyncio
async def test_spawn_returns_error_when_create_box_fails() -> None:
    spawner, _ = _make_spawner(create_box_fails=True)
    result = await spawner.spawn(_FakeAutomation(), _ctx())
    assert not result.succeeded
    assert result.error is not None
    assert "create_box" in result.error
