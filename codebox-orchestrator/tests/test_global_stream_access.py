"""Access-control regression tests for global lifecycle SSE events."""

from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime
from typing import Any

import pytest

from codebox_orchestrator.api.routes.sse import _global_event_generator
from codebox_orchestrator.auth.dependencies import UserInfo
from codebox_orchestrator.box.application.commands.create_box import CreateBoxHandler
from codebox_orchestrator.project.service import ProjectService
from codebox_orchestrator.shared.messaging.global_broadcast import GlobalBroadcastService


class FakeProjectService:
    def __init__(self, memberships: dict[str, set[str]] | None = None) -> None:
        self.memberships = memberships or {}

    async def has_member(self, project_id: str, user_id: str) -> bool:
        return project_id in self.memberships.get(user_id, set())


async def _next_event(
    gen,
    broadcast: GlobalBroadcastService,
    *events: dict[str, Any],
) -> dict[str, Any]:
    task = asyncio.create_task(anext(gen))
    await asyncio.sleep(0)
    for event in events:
        await broadcast.broadcast(event)
        await asyncio.sleep(0)
    line = await asyncio.wait_for(task, timeout=1)
    payload = line.split("data: ", 1)[1].strip()
    return json.loads(payload)


@pytest.mark.asyncio
async def test_global_stream_drops_other_project_events_for_normal_user() -> None:
    broadcast = GlobalBroadcastService()
    user = UserInfo(user_id="user-1", username="alice", user_type="user")
    service = FakeProjectService({"user-1": {"proj-allowed"}})
    gen = _global_event_generator(broadcast, user, service)  # type: ignore[arg-type]

    try:
        event = await _next_event(
            gen,
            broadcast,
            {"type": "project_deleted", "project_id": "proj-denied", "slug": "denied"},
            {"type": "project_deleted", "project_id": "proj-allowed", "slug": "allowed"},
        )
    finally:
        await gen.aclose()

    assert event == {"type": "project_deleted", "project_id": "proj-allowed", "slug": "allowed"}


@pytest.mark.asyncio
async def test_global_stream_drops_unscoped_events_for_normal_user() -> None:
    broadcast = GlobalBroadcastService()
    user = UserInfo(user_id="user-1", username="alice", user_type="user")
    service = FakeProjectService({"user-1": {"proj-allowed"}})
    gen = _global_event_generator(broadcast, user, service)  # type: ignore[arg-type]

    try:
        event = await _next_event(
            gen,
            broadcast,
            {"type": "box_status_changed", "box_id": "box-denied"},
            {
                "type": "box_status_changed",
                "box_id": "box-allowed",
                "project_id": "proj-allowed",
            },
        )
    finally:
        await gen.aclose()

    assert event == {
        "type": "box_status_changed",
        "box_id": "box-allowed",
        "project_id": "proj-allowed",
    }


@pytest.mark.asyncio
async def test_global_stream_allows_platform_admin_without_membership() -> None:
    broadcast = GlobalBroadcastService()
    user = UserInfo(user_id="admin-1", username="root", user_type="admin")
    service = FakeProjectService()
    gen = _global_event_generator(broadcast, user, service)  # type: ignore[arg-type]

    try:
        event = await _next_event(
            gen,
            broadcast,
            {"type": "project_deleted", "project_id": "proj-any", "slug": "any"},
        )
    finally:
        await gen.aclose()

    assert event == {"type": "project_deleted", "project_id": "proj-any", "slug": "any"}


class FakeProjectRepo:
    def __init__(self) -> None:
        self.list_for_user_calls: list[str] = []
        self.list_all_calls = 0

    async def list_for_user(self, user_id: str):
        self.list_for_user_calls.append(user_id)
        return []

    async def list_all(self):
        self.list_all_calls += 1
        return []


@pytest.mark.asyncio
async def test_project_list_uses_memberships_for_users_and_all_for_admins() -> None:
    repo = FakeProjectRepo()
    service = ProjectService(repo)  # type: ignore[arg-type]

    assert await service.list_projects("user-1", is_platform_admin=False) == []
    assert repo.list_for_user_calls == ["user-1"]
    assert repo.list_all_calls == 0

    assert await service.list_projects("admin-1", is_platform_admin=True) == []
    assert repo.list_for_user_calls == ["user-1"]
    assert repo.list_all_calls == 1


class FakePublisher:
    def __init__(self) -> None:
        self.global_events: list[dict[str, Any]] = []

    async def publish_box_event(self, box_id: str, event: dict[str, Any]) -> None:
        pass

    async def publish_global_event(self, event: dict[str, Any]) -> None:
        self.global_events.append(event)


class FakeLifecycle:
    def start_box(self, **kwargs: Any) -> None:
        pass


class FakeStateStore:
    def register(self, view: object) -> None:
        pass


class FakeBoxRepository:
    async def create(self, **kwargs: Any) -> object:
        return object()


@pytest.mark.asyncio
async def test_create_box_global_event_includes_project_id() -> None:
    publisher = FakePublisher()
    handler = CreateBoxHandler(
        publisher=publisher,  # type: ignore[arg-type]
        lifecycle=FakeLifecycle(),  # type: ignore[arg-type]
        state_store=FakeStateStore(),  # type: ignore[arg-type]
        box_repository=FakeBoxRepository(),  # type: ignore[arg-type]
    )

    before = datetime.now(UTC)
    view = await handler.execute(
        name="Build thing",
        provider="openai",
        model="gpt-test",
        project_id="proj-1",
        created_by="user-1",
    )

    assert view.project_id == "proj-1"
    event = publisher.global_events[0]
    assert event["type"] == "box_created"
    assert event["project_id"] == "proj-1"
    assert event["box_id"] == view.id
    assert datetime.fromisoformat(event["created_at"]) >= before
