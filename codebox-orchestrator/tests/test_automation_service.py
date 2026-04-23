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
    return AutomationService(repo=FakeRepo(), llm_profile_service=FakeLLMProfileService())


@pytest.mark.asyncio
async def test_eq_on_list_field_accepts_list_value(service):
    data = AutomationCreate(
        name="Test",
        trigger_kind="github.issues",
        workspace_mode="branch_from_issue",
        initial_prompt="Do something",
        trigger_filters=[TriggerFilterPredicate(field="labels", op="eq", value=["feature"])],
    )
    # Should not raise
    await service._validate("proj-1", data, existing=None)


@pytest.mark.asyncio
async def test_eq_on_string_field_requires_string_value(service):
    data = AutomationCreate(
        name="Test",
        trigger_kind="github.issues",
        workspace_mode="branch_from_issue",
        initial_prompt="Do something",
        trigger_filters=[TriggerFilterPredicate(field="action", op="eq", value=["opened"])],
    )
    with pytest.raises(ValueError, match="requires a string value"):
        await service._validate("proj-1", data, existing=None)


@pytest.mark.asyncio
async def test_matches_on_list_field_requires_string_value(service):
    data = AutomationCreate(
        name="Test",
        trigger_kind="github.issues",
        workspace_mode="branch_from_issue",
        initial_prompt="Do something",
        trigger_filters=[TriggerFilterPredicate(field="labels", op="matches", value=["feature"])],
    )
    with pytest.raises(ValueError, match="requires a string value"):
        await service._validate("proj-1", data, existing=None)
