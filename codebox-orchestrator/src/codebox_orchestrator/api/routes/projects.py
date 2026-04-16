"""Project management API routes."""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from codebox_orchestrator.api.dependencies import get_project_lifecycle_service
from codebox_orchestrator.api.schemas import (
    ProjectCreate,
    ProjectMemberCreate,
    ProjectMemberResponse,
    ProjectMemberUpdate,
    ProjectResponse,
    ProjectUpdate,
    ProjectUserSummary,
)
from codebox_orchestrator.auth.dependencies import UserInfo, get_current_user, require_admin
from codebox_orchestrator.project.dependencies import (
    ProjectContext,
    get_project_context,
    require_project_admin,
)

if TYPE_CHECKING:
    from codebox_orchestrator.project.service import (
        ProjectLifecycleService,
        ProjectMemberView,
        ProjectService,
        ProjectUserSummaryView,
    )

router = APIRouter(prefix="/api/projects", tags=["Projects"])


def _get_project_service(request: Request) -> ProjectService:
    return request.app.state.project_service


def _summary_to_response(summary: ProjectUserSummaryView) -> ProjectUserSummary:
    return ProjectUserSummary(
        id=summary.id,
        username=summary.username,
        first_name=summary.first_name,
        last_name=summary.last_name,
        status=summary.status,
    )


def _member_to_response(member: ProjectMemberView) -> ProjectMemberResponse:
    return ProjectMemberResponse(
        id=member.id,
        project_id=member.project_id,
        user_id=member.user_id,
        role=member.role,
        created_at=member.created_at,
        user=_summary_to_response(member.user),
    )


@router.post("", status_code=201, summary="Create project", operation_id="create_project")
async def create_project(
    body: ProjectCreate,
    user: UserInfo = Depends(require_admin),
    service: ProjectService = Depends(_get_project_service),
) -> ProjectResponse:
    view = await service.create_project(
        name=body.name,
        description=body.description,
        creator_user_id=user.user_id,
    )
    return ProjectResponse(**view.__dict__)


@router.get("", summary="List projects", operation_id="list_projects")
async def list_projects(
    user: UserInfo = Depends(get_current_user),
    service: ProjectService = Depends(_get_project_service),
) -> list[ProjectResponse]:
    views = await service.list_projects(user.user_id, is_platform_admin=user.user_type == "admin")
    return [ProjectResponse(**v.__dict__) for v in views]


@router.get("/{slug}", summary="Get project", operation_id="get_project")
async def get_project(
    ctx: ProjectContext = Depends(get_project_context),
    service: ProjectService = Depends(_get_project_service),
) -> ProjectResponse:
    view = await service.get_project_by_id(ctx.project_id)
    if view is None:
        raise HTTPException(404, "Project not found")
    return ProjectResponse(**view.__dict__)


@router.patch("/{slug}", summary="Update project", operation_id="update_project")
async def update_project(
    slug: str,
    body: ProjectUpdate,
    _user: UserInfo = Depends(require_admin),
    service: ProjectService = Depends(_get_project_service),
) -> ProjectResponse:
    current = await service.get_project_by_slug(slug)
    if current is None:
        raise HTTPException(404, "Project not found")
    view = await service.update_project(current.id, name=body.name, description=body.description)
    if view is None:
        raise HTTPException(404, "Project not found")
    return ProjectResponse(**view.__dict__)


@router.post("/{slug}/archive", summary="Archive project", operation_id="archive_project")
async def archive_project(
    slug: str,
    _user: UserInfo = Depends(require_admin),
    service: ProjectService = Depends(_get_project_service),
    lifecycle: ProjectLifecycleService = Depends(get_project_lifecycle_service),
) -> ProjectResponse:
    current = await service.get_project_by_slug(slug)
    if current is None:
        raise HTTPException(404, "Project not found")
    view = await lifecycle.archive(current.id)
    if view is None:
        raise HTTPException(404, "Project not found")
    return ProjectResponse(**view.__dict__)


@router.post("/{slug}/restore", summary="Restore project", operation_id="restore_project")
async def restore_project(
    slug: str,
    _user: UserInfo = Depends(require_admin),
    service: ProjectService = Depends(_get_project_service),
    lifecycle: ProjectLifecycleService = Depends(get_project_lifecycle_service),
) -> ProjectResponse:
    current = await service.get_project_by_slug(slug)
    if current is None:
        raise HTTPException(404, "Project not found")
    view = await lifecycle.restore(current.id)
    if view is None:
        raise HTTPException(404, "Project not found")
    return ProjectResponse(**view.__dict__)


@router.delete("/{slug}", summary="Delete project", operation_id="delete_project")
async def delete_project(
    slug: str,
    _user: UserInfo = Depends(require_admin),
    service: ProjectService = Depends(_get_project_service),
    lifecycle: ProjectLifecycleService = Depends(get_project_lifecycle_service),
) -> dict[str, str]:
    current = await service.get_project_by_slug(slug)
    if current is None:
        raise HTTPException(404, "Project not found")
    deleted = await lifecycle.delete(current.id)
    if deleted is None:
        raise HTTPException(404, "Project not found")
    return {"status": "deleted"}


@router.get("/{slug}/members", summary="List project members", operation_id="list_project_members")
async def list_members(
    ctx: ProjectContext = Depends(get_project_context),
    service: ProjectService = Depends(_get_project_service),
) -> list[ProjectMemberResponse]:
    members = await service.list_members(ctx.project_id)
    return [_member_to_response(m) for m in members]


@router.get(
    "/{slug}/member-candidates",
    summary="Search users eligible to be added as project members",
    operation_id="search_project_member_candidates",
)
async def search_member_candidates(
    q: str | None = Query(default=None, description="Search query"),
    limit: int = Query(default=20, ge=1, le=50),
    ctx: ProjectContext = Depends(require_project_admin),
    service: ProjectService = Depends(_get_project_service),
) -> list[ProjectUserSummary]:
    candidates = await service.search_member_candidates(ctx.project_id, query=q, limit=limit)
    return [_summary_to_response(c) for c in candidates]


@router.post(
    "/{slug}/members",
    status_code=201,
    summary="Add project member",
    operation_id="add_project_member",
)
async def add_member(
    body: ProjectMemberCreate,
    ctx: ProjectContext = Depends(require_project_admin),
    service: ProjectService = Depends(_get_project_service),
) -> ProjectMemberResponse:
    member = await service.add_member(ctx.project_id, body.user_id, body.role)
    return _member_to_response(member)


@router.patch(
    "/{slug}/members/{user_id}",
    summary="Update project member",
    operation_id="update_project_member",
)
async def update_member_role(
    user_id: str,
    body: ProjectMemberUpdate,
    ctx: ProjectContext = Depends(require_project_admin),
    service: ProjectService = Depends(_get_project_service),
) -> ProjectMemberResponse:
    member = await service.update_member_role(ctx.project_id, user_id, body.role)
    if member is None:
        raise HTTPException(404, "Member not found")
    return _member_to_response(member)


@router.delete(
    "/{slug}/members/{user_id}",
    status_code=204,
    summary="Remove project member",
    operation_id="remove_project_member",
)
async def remove_member(
    user_id: str,
    ctx: ProjectContext = Depends(require_project_admin),
    service: ProjectService = Depends(_get_project_service),
) -> None:
    removed = await service.remove_member(ctx.project_id, user_id)
    if not removed:
        raise HTTPException(404, "Member not found")
