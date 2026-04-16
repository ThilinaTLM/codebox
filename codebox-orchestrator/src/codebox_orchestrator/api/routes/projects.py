"""Project management API routes."""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import APIRouter, Depends, HTTPException, Request

from codebox_orchestrator.api.schemas import (
    ProjectCreate,
    ProjectMemberCreate,
    ProjectMemberResponse,
    ProjectMemberUpdate,
    ProjectResponse,
    ProjectUpdate,
)
from codebox_orchestrator.auth.dependencies import UserInfo, get_current_user, require_admin
from codebox_orchestrator.project.dependencies import (
    ProjectContext,
    get_project_context,
    require_project_admin,
)

if TYPE_CHECKING:
    from codebox_orchestrator.project.service import ProjectService

router = APIRouter(prefix="/api/projects", tags=["Projects"])


def _get_project_service(request: Request) -> ProjectService:
    return request.app.state.project_service


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
    body: ProjectUpdate,
    ctx: ProjectContext = Depends(require_project_admin),
    service: ProjectService = Depends(_get_project_service),
) -> ProjectResponse:
    view = await service.update_project(
        ctx.project_id, name=body.name, description=body.description
    )
    if view is None:
        raise HTTPException(404, "Project not found")
    return ProjectResponse(**view.__dict__)


@router.post("/{slug}/archive", summary="Archive project", operation_id="archive_project")
async def archive_project(
    ctx: ProjectContext = Depends(require_project_admin),
    service: ProjectService = Depends(_get_project_service),
) -> ProjectResponse:
    view = await service.archive_project(ctx.project_id)
    if view is None:
        raise HTTPException(404, "Project not found")
    return ProjectResponse(**view.__dict__)


@router.post("/{slug}/restore", summary="Restore project", operation_id="restore_project")
async def restore_project(
    ctx: ProjectContext = Depends(require_project_admin),
    service: ProjectService = Depends(_get_project_service),
) -> ProjectResponse:
    view = await service.restore_project(ctx.project_id)
    if view is None:
        raise HTTPException(404, "Project not found")
    return ProjectResponse(**view.__dict__)


@router.delete("/{slug}", summary="Delete project", operation_id="delete_project")
async def delete_project(
    ctx: ProjectContext = Depends(require_project_admin),
    service: ProjectService = Depends(_get_project_service),
) -> dict[str, str]:
    deleted = await service.delete_project(ctx.project_id)
    if not deleted:
        raise HTTPException(404, "Project not found")
    return {"status": "deleted"}


@router.get("/{slug}/members", summary="List project members", operation_id="list_project_members")
async def list_members(
    ctx: ProjectContext = Depends(get_project_context),
    service: ProjectService = Depends(_get_project_service),
) -> list[ProjectMemberResponse]:
    members = await service.list_members(ctx.project_id)
    return [ProjectMemberResponse(**m.__dict__) for m in members]


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
    return ProjectMemberResponse(**member.__dict__)


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
    return ProjectMemberResponse(**member.__dict__)


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
