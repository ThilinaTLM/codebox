"""Dispatcher-level tests for the structural repo + action gates.

The unit under test is ``GitHubWebhookDispatcher.dispatch``, focusing on
the new structural gating behaviour (repo + action) that replaces the
previous coarse ``github.issues``-matches-everything footgun. These tests
use in-memory fakes instead of the real DB / GitHub client because the
gates themselves live entirely in orchestrator code.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Any

import pytest

from codebox_orchestrator.automation.application.context_builders import (
    ContextBuilderRegistry,
)
from codebox_orchestrator.automation.application.matcher import AutomationMatcher
from codebox_orchestrator.automation.application.renderer import PromptRenderer
from codebox_orchestrator.integration.github.application.webhook_dispatcher import (
    GitHubWebhookDispatcher,
)

# --- Fakes ---------------------------------------------------------------


@dataclass
class _FakeAutomation:
    id: str
    project_id: str
    name: str
    trigger_repo: str
    trigger_kind: str
    trigger_actions: list[str] | None
    trigger_filters: list[dict[str, Any]] | None = None
    workspace_mode: str = "branch_from_issue"
    pinned_branch: str | None = None
    llm_profile_id: str | None = None
    system_prompt: str | None = None
    initial_prompt: str = "Do something with ${{REPO_FULL_NAME}}"
    enabled: bool = True


@dataclass
class _RecordedRun:
    automation_id: str
    trigger_kind: str
    status: str
    matched_action: str | None = None
    error: str | None = None
    box_id: str | None = None
    github_event_id: str | None = None


class _FakeAutomationRepo:
    def __init__(self, automations: list[_FakeAutomation]) -> None:
        self._automations = automations
        self.runs: list[_RecordedRun] = []

    async def list_enabled_for_event(
        self,
        project_id: str,
        trigger_kind: str,
        *,
        repo: str | None = None,
        action: str | None = None,
    ) -> list[_FakeAutomation]:
        rows = [
            a
            for a in self._automations
            if a.project_id == project_id and a.trigger_kind == trigger_kind and a.enabled
        ]
        if repo is not None:
            rl = repo.lower()
            rows = [r for r in rows if r.trigger_repo.lower() == rl]
        if action is not None:
            rows = [r for r in rows if r.trigger_actions is None or action in r.trigger_actions]
        return rows

    async def record_run(
        self,
        *,
        project_id: str,
        automation_id: str,
        trigger_kind: str,
        status: str,
        matched_action: str | None = None,
        box_id: str | None = None,
        github_event_id: str | None = None,
        error: str | None = None,
    ) -> str:
        self.runs.append(
            _RecordedRun(
                automation_id=automation_id,
                trigger_kind=trigger_kind,
                status=status,
                matched_action=matched_action,
                box_id=box_id,
                github_event_id=github_event_id,
                error=error,
            )
        )
        return str(uuid.uuid4())


@dataclass
class _StubInstallation:
    id: str
    installation_id: int


class _FakeGitHubRepo:
    def __init__(self) -> None:
        self._events: dict[str, str] = {}
        self._installations: dict[int, _StubInstallation] = {}

    async def event_exists(self, delivery_id: str) -> bool:
        return delivery_id in self._events

    async def store_event(
        self,
        *,
        delivery_id: str,
        event_type: str,
        action: str,
        repository: str,
        payload: str,
        project_id: str,
    ) -> str:
        event_id = str(uuid.uuid4())
        self._events[delivery_id] = event_id
        return event_id

    async def get_installation_by_github_id(
        self, installation_id: int, *, project_id: str
    ) -> _StubInstallation | None:
        return self._installations.get(installation_id)

    async def store_installation(
        self,
        *,
        installation_id: int,
        account_login: str,
        account_type: str,
        project_id: str,
    ) -> _StubInstallation:
        inst = _StubInstallation(id=str(uuid.uuid4()), installation_id=installation_id)
        self._installations[installation_id] = inst
        return inst


class _FakeApi:
    def verify_webhook_signature(self, payload: bytes, signature: str) -> bool:
        return True

    async def extract_issue_context(
        self, *_a: Any, **_kw: Any
    ) -> dict:  # pragma: no cover - not used in dispatcher gates
        return {"comments": []}


class _RecordingCreateBox:
    """Captures ``execute`` calls. Returns an object with an ``id`` field."""

    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []

    async def execute(self, **kwargs: Any) -> Any:
        self.calls.append(kwargs)

        @dataclass
        class _View:
            id: str = field(default_factory=lambda: str(uuid.uuid4()))

        return _View()


class _FakeProfile:
    provider = "anthropic"
    model = "claude-3-5-sonnet-20241022"
    api_key = "sk-test"  # pragma: allowlist secret
    base_url: str | None = None


class _FakeProfileService:
    async def resolve_profile(self, profile_id: str, project_id: str):
        return _FakeProfile()


class _FakeSettingsService:
    async def get_default_profile_id(self, project_id: str) -> str:
        return "prof-default"

    async def get_tavily_api_key(self, project_id: str) -> None:
        return None


# --- Payload helper ------------------------------------------------------


def _issues_payload(*, repo: str, action: str, number: int = 42) -> dict[str, Any]:
    return {
        "action": action,
        "installation": {"id": 1},
        "repository": {"full_name": repo, "default_branch": "main"},
        "issue": {
            "number": number,
            "title": "An issue",
            "body": "body",
            "html_url": f"https://github.com/{repo}/issues/{number}",
            "state": "open",
            "user": {"login": "octocat"},
            "labels": [{"name": "feature"}],
        },
    }


# --- Dispatcher builder --------------------------------------------------


def _make_dispatcher(
    automations: list[_FakeAutomation],
) -> tuple[
    GitHubWebhookDispatcher,
    _FakeAutomationRepo,
    _RecordingCreateBox,
]:
    repo = _FakeAutomationRepo(automations)
    create_box = _RecordingCreateBox()
    dispatcher = GitHubWebhookDispatcher(
        api_client=_FakeApi(),
        github_repo=_FakeGitHubRepo(),
        automation_repo=repo,
        matcher=AutomationMatcher(),
        renderer=PromptRenderer(),
        context_builder_registry=ContextBuilderRegistry.default(),
        create_box=create_box,
        profile_service=_FakeProfileService(),
        settings_service=_FakeSettingsService(),
        project_id="proj-1",
    )
    return dispatcher, repo, create_box


# --- Tests --------------------------------------------------------------


@pytest.mark.asyncio
async def test_repo_mismatch_never_records_a_run():
    """An event for repo B must not fire an automation targeted at repo A."""
    automation = _FakeAutomation(
        id="a1",
        project_id="proj-1",
        name="Dev",
        trigger_repo="acme/widgets",
        trigger_kind="github.issues",
        trigger_actions=["opened"],
    )
    dispatcher, repo, create_box = _make_dispatcher([automation])

    result = await dispatcher.dispatch(
        "issues",
        delivery_id="d1",
        payload=_issues_payload(repo="other-org/other-repo", action="opened"),
    )

    assert result.matched == 0
    assert result.spawned == 0
    assert len(create_box.calls) == 0
    # Structural misses do not record noisy ``skipped_filter`` runs.
    assert repo.runs == []


@pytest.mark.asyncio
async def test_action_not_in_trigger_actions_never_records_a_run():
    automation = _FakeAutomation(
        id="a1",
        project_id="proj-1",
        name="Dev",
        trigger_repo="acme/widgets",
        trigger_kind="github.issues",
        trigger_actions=["opened"],
    )
    dispatcher, repo, create_box = _make_dispatcher([automation])

    result = await dispatcher.dispatch(
        "issues",
        delivery_id="d1",
        payload=_issues_payload(repo="acme/widgets", action="labeled"),
    )

    assert result.matched == 0
    assert result.spawned == 0
    assert len(create_box.calls) == 0
    assert repo.runs == []


@pytest.mark.asyncio
async def test_predicate_miss_after_gates_pass_records_skipped_filter():
    automation = _FakeAutomation(
        id="a1",
        project_id="proj-1",
        name="Dev",
        trigger_repo="acme/widgets",
        trigger_kind="github.issues",
        trigger_actions=["opened"],
        trigger_filters=[{"field": "labels", "op": "contains_any", "value": ["bug"]}],
    )
    dispatcher, repo, _create_box = _make_dispatcher([automation])

    # Payload has a ``feature`` label, so the predicate misses.
    result = await dispatcher.dispatch(
        "issues",
        delivery_id="d1",
        payload=_issues_payload(repo="acme/widgets", action="opened"),
    )

    assert result.skipped == 1
    assert result.spawned == 0
    assert len(repo.runs) == 1
    assert repo.runs[0].status == "skipped_filter"
    assert repo.runs[0].matched_action == "opened"


@pytest.mark.asyncio
async def test_issue_opened_with_label_spawns_exactly_one_box():
    """Regression for the original bug: GitHub fires ``opened`` and ``labeled``
    in quick succession when an issue is created with a label. With
    ``trigger_actions=["opened"]`` only the ``opened`` delivery spawns a box.
    """
    automation = _FakeAutomation(
        id="a1",
        project_id="proj-1",
        name="Dev",
        trigger_repo="acme/widgets",
        trigger_kind="github.issues",
        trigger_actions=["opened"],
        trigger_filters=[{"field": "labels", "op": "contains_any", "value": ["feature"]}],
    )
    dispatcher, repo, create_box = _make_dispatcher([automation])

    # Simulate the three deliveries from the bug report.
    for delivery_id, action in (
        ("d-opened", "opened"),
        ("d-labeled", "labeled"),
        ("d-closed", "closed"),
    ):
        await dispatcher.dispatch(
            "issues",
            delivery_id=delivery_id,
            payload=_issues_payload(repo="acme/widgets", action=action),
        )

    spawned = [r for r in repo.runs if r.status == "spawned"]
    assert len(spawned) == 1
    assert spawned[0].matched_action == "opened"
    assert len(create_box.calls) == 1
