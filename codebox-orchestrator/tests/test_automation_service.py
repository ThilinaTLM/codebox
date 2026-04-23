"""Unit tests for AutomationService validation rules."""

from __future__ import annotations

import pytest

from codebox_orchestrator.automation.schemas import AutomationCreate, TriggerFilterPredicate
from codebox_orchestrator.automation.service import AutomationService


class FakeRepo:
    async def count_scheduled(self, project_id: str) -> int:
        return 0


class FakeLLMProfileService:
    async def resolve_profile(self, profile_id: str, project_id: str):
        return None


@pytest.fixture
def service():
    # github_client_manager=None skips the repo preflight, which lets us
    # focus on shape/validation rules without needing a real installation.
    return AutomationService(repo=FakeRepo(), llm_profile_service=FakeLLMProfileService())


def _base_kwargs(**overrides):
    base = {
        "name": "Test",
        "trigger_repo": "acme/widgets",
        "trigger_kind": "github.issues",
        "trigger_actions": ["opened"],
        "workspace_mode": "branch_from_issue",
        "initial_prompt": "Do something",
    }
    base.update(overrides)
    return base


# --- Filter predicate shape -----------------------------------------------


@pytest.mark.asyncio
async def test_eq_on_list_field_accepts_list_value(service):
    data = AutomationCreate(
        **_base_kwargs(
            trigger_filters=[TriggerFilterPredicate(field="labels", op="eq", value=["feature"])],
        )
    )
    await service._validate("proj-1", data, existing=None)


@pytest.mark.asyncio
async def test_matches_on_list_field_requires_string_value(service):
    data = AutomationCreate(
        **_base_kwargs(
            trigger_filters=[
                TriggerFilterPredicate(field="labels", op="matches", value=["feature"])
            ],
        )
    )
    with pytest.raises(ValueError, match="requires a string value"):
        await service._validate("proj-1", data, existing=None)


@pytest.mark.asyncio
async def test_action_field_is_no_longer_allowed(service):
    """``action`` was promoted to ``trigger_actions`` and is no longer a filter field."""
    data = AutomationCreate(
        **_base_kwargs(
            trigger_filters=[TriggerFilterPredicate(field="action", op="eq", value="opened")],
        )
    )
    with pytest.raises(ValueError, match="not allowed for trigger_kind"):
        await service._validate("proj-1", data, existing=None)


@pytest.mark.asyncio
async def test_repo_field_is_no_longer_allowed(service):
    """``repo`` is structural (``trigger_repo``) and cannot appear in filters."""
    data = AutomationCreate(
        **_base_kwargs(
            trigger_filters=[TriggerFilterPredicate(field="repo", op="eq", value="acme/widgets")],
        )
    )
    with pytest.raises(ValueError, match="not allowed for trigger_kind"):
        await service._validate("proj-1", data, existing=None)


# --- trigger_actions ------------------------------------------------------


@pytest.mark.asyncio
async def test_trigger_actions_required_for_github_issues(service):
    data = AutomationCreate(**_base_kwargs(trigger_actions=None))
    with pytest.raises(ValueError, match="at least one action"):
        await service._validate("proj-1", data, existing=None)


@pytest.mark.asyncio
async def test_trigger_actions_empty_list_is_rejected(service):
    data = AutomationCreate(**_base_kwargs(trigger_actions=[]))
    with pytest.raises(ValueError, match="at least one action"):
        await service._validate("proj-1", data, existing=None)


@pytest.mark.asyncio
async def test_trigger_actions_must_be_subset_of_known(service):
    data = AutomationCreate(**_base_kwargs(trigger_actions=["opened", "flurbed"]))
    with pytest.raises(ValueError, match="unknown action"):
        await service._validate("proj-1", data, existing=None)


@pytest.mark.asyncio
async def test_trigger_actions_must_be_none_for_push(service):
    data = AutomationCreate(
        **_base_kwargs(
            trigger_kind="github.push",
            trigger_actions=["pushed"],
            workspace_mode="checkout_ref",
        )
    )
    with pytest.raises(ValueError, match="must be empty"):
        await service._validate("proj-1", data, existing=None)


@pytest.mark.asyncio
async def test_trigger_actions_must_be_none_for_schedule(service):
    data = AutomationCreate(
        **_base_kwargs(
            trigger_kind="schedule",
            trigger_actions=["fired"],
            workspace_mode="pinned",
            pinned_branch="main",
            schedule_cron="*/10 * * * *",
        )
    )
    with pytest.raises(ValueError, match="must be empty"):
        await service._validate("proj-1", data, existing=None)


@pytest.mark.asyncio
async def test_trigger_actions_deduplicated(service):
    data = AutomationCreate(**_base_kwargs(trigger_actions=["opened", "opened", "reopened"]))
    await service._validate("proj-1", data, existing=None)
    assert data.trigger_actions == ["opened", "reopened"]


# --- trigger_repo shape ---------------------------------------------------


@pytest.mark.asyncio
async def test_trigger_repo_format_enforced_by_pydantic():
    with pytest.raises(ValueError):
        AutomationCreate(**_base_kwargs(trigger_repo="not-a-repo"))


# --- workspace_mode rules (unchanged semantics, pinned_branch only) ------


@pytest.mark.asyncio
async def test_pinned_mode_requires_pinned_branch(service):
    data = AutomationCreate(
        **_base_kwargs(
            trigger_kind="schedule",
            trigger_actions=None,
            workspace_mode="pinned",
            pinned_branch=None,
            schedule_cron="*/10 * * * *",
        )
    )
    with pytest.raises(ValueError, match="pinned_branch"):
        await service._validate("proj-1", data, existing=None)


@pytest.mark.asyncio
async def test_schedule_requires_pinned_workspace(service):
    data = AutomationCreate(
        **_base_kwargs(
            trigger_kind="schedule",
            trigger_actions=None,
            workspace_mode="checkout_ref",
            schedule_cron="*/10 * * * *",
        )
    )
    with pytest.raises(ValueError, match="must use 'pinned'"):
        await service._validate("proj-1", data, existing=None)


@pytest.mark.asyncio
async def test_pr_kind_rejects_branch_from_issue(service):
    data = AutomationCreate(
        **_base_kwargs(
            trigger_kind="github.pull_request",
            trigger_actions=["opened"],
            workspace_mode="branch_from_issue",
        )
    )
    with pytest.raises(ValueError, match="not valid for PR-family"):
        await service._validate("proj-1", data, existing=None)


# --- pinned_repo is gone --------------------------------------------------


def test_pinned_repo_field_no_longer_accepted():
    """``pinned_repo`` was removed from the schema after being merged into
    ``trigger_repo``. Pydantic silently ignores unknown fields, but the
    resulting model must not carry the attribute."""
    data = AutomationCreate(**_base_kwargs(pinned_repo="acme/widgets"))
    assert not hasattr(data, "pinned_repo")
