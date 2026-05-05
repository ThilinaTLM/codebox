"""Access-control tests for project visibility and membership enforcement."""

from __future__ import annotations

import pytest

from codebox_orchestrator.auth.dependencies import UserInfo
from codebox_orchestrator.project.dependencies import get_project_context
from codebox_orchestrator.project.service import ProjectService

# ── Service-layer tests ─────────────────────────────────────────────
#
# These tests verify that ProjectService.list_projects_with_role
# correctly returns only member-visible projects for regular users
# and all projects for platform admins.


class _FakeRepo:
    """Minimal repository stub for service-layer tests."""

    def __init__(
        self,
        all_projects: list | None = None,
        user_projects_with_roles: list | None = None,
    ) -> None:
        self._all_projects = all_projects or []
        self._user_projects_with_roles = user_projects_with_roles or []

    async def list_all_with_role(
        self, role: str = "admin", *, include_archived: bool = True, include_deleted: bool = False
    ) -> list:
        return [(p, role) for p in self._all_projects]

    async def list_for_user_with_roles(
        self, user_id: str, *, include_archived: bool = False, include_deleted: bool = False
    ) -> list:
        return self._user_projects_with_roles


class _FakeProject:
    """Lightweight project object with the attributes ProjectService._to_view needs."""

    def __init__(self, project_id: str, name: str, slug: str, status: str = "active") -> None:
        self.id = project_id
        self.name = name
        self.slug = slug
        self.description = None
        self.created_by = "admin"
        self.status = status
        from datetime import UTC, datetime

        self.created_at = datetime.now(UTC)
        self.updated_at = self.created_at


@pytest.mark.asyncio
async def test_list_projects_with_role_regular_user_sees_only_member_projects():
    """A regular user should only see projects they are explicitly a member of."""
    proj_a = _FakeProject("p1", "Alpha", "alpha")

    # User is a contributor in Alpha only (not a member of Beta).
    repo = _FakeRepo(user_projects_with_roles=[(proj_a, "contributor")])
    service = ProjectService(repo)  # type: ignore[arg-type]

    result = await service.list_projects_with_role("user-1", is_platform_admin=False)

    assert len(result) == 1
    assert result[0][0].slug == "alpha"
    assert result[0][1] == "contributor"


@pytest.mark.asyncio
async def test_list_projects_with_role_regular_user_with_no_memberships_sees_nothing():
    """A regular user with no project memberships should see zero projects."""
    repo = _FakeRepo(user_projects_with_roles=[])
    service = ProjectService(repo)  # type: ignore[arg-type]

    result = await service.list_projects_with_role("lonely-user", is_platform_admin=False)

    assert result == []


@pytest.mark.asyncio
async def test_list_projects_with_role_platform_admin_sees_all_projects():
    """A platform admin should see every project with synthetic admin role."""
    proj_a = _FakeProject("p1", "Alpha", "alpha")
    proj_b = _FakeProject("p2", "Beta", "beta")

    repo = _FakeRepo(all_projects=[proj_a, proj_b])
    service = ProjectService(repo)  # type: ignore[arg-type]

    result = await service.list_projects_with_role("admin-1", is_platform_admin=True)

    assert len(result) == 2
    slugs = {r[0].slug for r in result}
    assert slugs == {"alpha", "beta"}
    # Platform admins always get the "admin" role regardless of membership.
    assert all(r[1] == "admin" for r in result)


# ── get_project_context access-control tests ────────────────────────
#
# Verify that non-members receive 404 (not 403) to prevent slug
# enumeration, and that platform admins always receive access.


class _FakeProjectView:
    def __init__(self, project_id: str, slug: str, status: str = "active") -> None:
        self.id = project_id
        self.slug = slug
        self.status = status


class _FakeMemberView:
    def __init__(self, role: str) -> None:
        self.role = role


class _FakeProjectService:
    """Minimal project service stub for dependency tests."""

    def __init__(
        self,
        project_by_slug: dict[str, _FakeProjectView] | None = None,
        members: dict[tuple[str, str], _FakeMemberView] | None = None,
    ) -> None:
        self._project_by_slug = project_by_slug or {}
        self._members = members or {}

    async def get_project_by_slug(self, slug: str):
        return self._project_by_slug.get(slug)

    async def get_member(self, project_id: str, user_id: str):
        return self._members.get((project_id, user_id))


@pytest.mark.asyncio
async def test_get_project_context_non_member_gets_404():
    """A non-member requesting a project should get 404 (not 403)."""
    from fastapi import HTTPException

    project = _FakeProjectView(project_id="p1", slug="secret-project", status="active")
    service = _FakeProjectService(
        project_by_slug={"secret-project": project},
        members={},  # no memberships
    )

    # Build a minimal request-like object with app.state
    class _FakeApp:
        class _State:
            def __init__(self, project_service: _FakeProjectService) -> None:
                self.project_service = project_service

        def __init__(self, project_service: _FakeProjectService) -> None:
            self.state = self._State(project_service)

    class _FakeRequest:
        app: _FakeApp

        def __init__(self, service: _FakeProjectService) -> None:
            self.app = _FakeApp(service)

    user = UserInfo(user_id="stranger", username="stranger", user_type="user")

    with pytest.raises(HTTPException) as exc_info:
        await get_project_context(
            slug="secret-project",
            request=_FakeRequest(service),  # type: ignore[arg-type]
            user=user,
        )

    assert exc_info.value.status_code == 404
    assert "Project not found" in exc_info.value.detail


@pytest.mark.asyncio
async def test_get_project_context_member_gets_access():
    """A project member should receive a ProjectContext with their role."""
    project = _FakeProjectView(project_id="p1", slug="my-project", status="active")
    service = _FakeProjectService(
        project_by_slug={"my-project": project},
        members={("p1", "contributor-1"): _FakeMemberView("contributor")},
    )

    class _FakeApp:
        class _State:
            def __init__(self, project_service: _FakeProjectService) -> None:
                self.project_service = project_service

        def __init__(self, project_service: _FakeProjectService) -> None:
            self.state = self._State(project_service)

    class _FakeRequest:
        app: _FakeApp

        def __init__(self, service: _FakeProjectService) -> None:
            self.app = _FakeApp(service)

    user = UserInfo(user_id="contributor-1", username="alice", user_type="user")

    ctx = await get_project_context(
        slug="my-project",
        request=_FakeRequest(service),  # type: ignore[arg-type]
        user=user,
    )

    assert ctx.project_id == "p1"
    assert ctx.project_slug == "my-project"
    assert ctx.project_role == "contributor"
    assert ctx.is_platform_admin is False


@pytest.mark.asyncio
async def test_get_project_context_platform_admin_gets_access_without_membership():
    """A platform admin should get access even without explicit membership."""
    project = _FakeProjectView(project_id="p1", slug="any-project", status="active")
    service = _FakeProjectService(
        project_by_slug={"any-project": project},
        members={},  # no memberships — admin has none
    )

    class _FakeApp:
        class _State:
            def __init__(self, project_service: _FakeProjectService) -> None:
                self.project_service = project_service

        def __init__(self, project_service: _FakeProjectService) -> None:
            self.state = self._State(project_service)

    class _FakeRequest:
        app: _FakeApp

        def __init__(self, service: _FakeProjectService) -> None:
            self.app = _FakeApp(service)

    user = UserInfo(user_id="admin-1", username="admin", user_type="admin")

    ctx = await get_project_context(
        slug="any-project",
        request=_FakeRequest(service),  # type: ignore[arg-type]
        user=user,
    )

    assert ctx.project_id == "p1"
    assert ctx.project_role == "admin"
    assert ctx.is_platform_admin is True


@pytest.mark.asyncio
async def test_get_project_context_archived_project_non_admin_gets_404():
    """A non-admin requesting an archived project should get 404 (not 403)."""
    from fastapi import HTTPException

    project = _FakeProjectView(project_id="p1", slug="dead-project", status="archived")
    service = _FakeProjectService(project_by_slug={"dead-project": project})

    class _FakeApp:
        class _State:
            def __init__(self, project_service: _FakeProjectService) -> None:
                self.project_service = project_service

        def __init__(self, project_service: _FakeProjectService) -> None:
            self.state = self._State(project_service)

    class _FakeRequest:
        app: _FakeApp

        def __init__(self, service: _FakeProjectService) -> None:
            self.app = _FakeApp(service)

    user = UserInfo(user_id="regular-1", username="bob", user_type="user")

    with pytest.raises(HTTPException) as exc_info:
        await get_project_context(
            slug="dead-project",
            request=_FakeRequest(service),  # type: ignore[arg-type]
            user=user,
        )

    # Should be 404, NOT 403 — prevents slug enumeration.
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_get_project_context_nonexistent_project_gets_404():
    """Requesting a completely nonexistent project should return 404."""
    from fastapi import HTTPException

    service = _FakeProjectService(project_by_slug={})

    class _FakeApp:
        class _State:
            def __init__(self, project_service: _FakeProjectService) -> None:
                self.project_service = project_service

        def __init__(self, project_service: _FakeProjectService) -> None:
            self.state = self._State(project_service)

    class _FakeRequest:
        app: _FakeApp

        def __init__(self, service: _FakeProjectService) -> None:
            self.app = _FakeApp(service)

    user = UserInfo(user_id="anyone", username="anyone", user_type="user")

    with pytest.raises(HTTPException) as exc_info:
        await get_project_context(
            slug="ghost-project",
            request=_FakeRequest(service),  # type: ignore[arg-type]
            user=user,
        )

    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_get_project_context_archived_project_admin_gets_access():
    """A platform admin should be able to access an archived project."""
    project = _FakeProjectView(project_id="p1", slug="archived-proj", status="archived")
    service = _FakeProjectService(
        project_by_slug={"archived-proj": project},
        members={},
    )

    class _FakeApp:
        class _State:
            def __init__(self, project_service: _FakeProjectService) -> None:
                self.project_service = project_service

        def __init__(self, project_service: _FakeProjectService) -> None:
            self.state = self._State(project_service)

    class _FakeRequest:
        app: _FakeApp

        def __init__(self, service: _FakeProjectService) -> None:
            self.app = _FakeApp(service)

    user = UserInfo(user_id="admin-1", username="admin", user_type="admin")

    ctx = await get_project_context(
        slug="archived-proj",
        request=_FakeRequest(service),  # type: ignore[arg-type]
        user=user,
    )

    assert ctx.project_id == "p1"
    assert ctx.project_role == "admin"
    assert ctx.is_archived is True
