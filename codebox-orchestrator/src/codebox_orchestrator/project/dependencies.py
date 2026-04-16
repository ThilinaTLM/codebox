"""FastAPI dependencies for project-scoped access control."""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import Depends, HTTPException, Request

from codebox_orchestrator.auth.dependencies import UserInfo, get_current_user


@dataclass
class ProjectContext:
    """Resolved project context available to route handlers."""

    project_id: str
    project_slug: str
    user_id: str
    user_type: str  # platform role: "admin" | "user"
    project_role: str  # project role: "admin" | "contributor"

    @property
    def is_project_admin(self) -> bool:
        return self.project_role == "admin"

    @property
    def is_platform_admin(self) -> bool:
        return self.user_type == "admin"


async def get_project_context(
    slug: str,
    request: Request,
    user: UserInfo = Depends(get_current_user),
) -> ProjectContext:
    """Validate user is a member of the project identified by *slug*.

    Platform admins are always granted access with a synthetic 'admin' project role.
    """
    from codebox_orchestrator.project.service import ProjectService  # noqa: PLC0415, TC001

    project_service: ProjectService = request.app.state.project_service
    project = await project_service.get_project_by_slug(slug)
    if project is None:
        raise HTTPException(404, "Project not found")

    # Platform admins always have access
    if user.user_type == "admin":
        return ProjectContext(
            project_id=project.id,
            project_slug=project.slug,
            user_id=user.user_id,
            user_type=user.user_type,
            project_role="admin",
        )

    member = await project_service.get_member(project.id, user.user_id)
    if member is None:
        raise HTTPException(403, "You are not a member of this project")

    return ProjectContext(
        project_id=project.id,
        project_slug=project.slug,
        user_id=user.user_id,
        user_type=user.user_type,
        project_role=member.role,
    )


async def require_project_admin(
    ctx: ProjectContext = Depends(get_project_context),
) -> ProjectContext:
    """Raise 403 if user is not a project admin (or platform admin)."""
    if not ctx.is_project_admin and not ctx.is_platform_admin:
        raise HTTPException(403, "Project admin access required")
    return ctx
