"""Business logic for project management."""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from typing import TYPE_CHECKING

from codebox_orchestrator.project.models import Project, ProjectStatus

if TYPE_CHECKING:
    from codebox_orchestrator.project.models import ProjectMember
    from codebox_orchestrator.project.repository import ProjectRepository


@dataclass
class ProjectView:
    id: str
    name: str
    slug: str
    description: str | None
    created_by: str
    status: str
    created_at: str
    updated_at: str


@dataclass
class ProjectMemberView:
    id: str
    project_id: str
    user_id: str
    role: str
    created_at: str


class ProjectService:
    def __init__(self, repo: ProjectRepository) -> None:
        self._repo = repo

    async def create_project(
        self,
        *,
        name: str,
        description: str | None = None,
        creator_user_id: str,
    ) -> ProjectView:
        slug = slugify(name)
        project = Project(
            name=name,
            slug=slug,
            description=description,
            created_by=creator_user_id,
            status=ProjectStatus.ACTIVE,
        )
        created = await self._repo.create(project, creator_role="admin")
        return self._to_view(created)

    async def get_project_by_slug(self, slug: str) -> ProjectView | None:
        project = await self._repo.get_by_slug(slug)
        return self._to_view(project) if project else None

    async def get_project_by_id(self, project_id: str) -> ProjectView | None:
        project = await self._repo.get_by_id(project_id)
        return self._to_view(project) if project else None

    async def list_projects(
        self, user_id: str, *, is_platform_admin: bool = False
    ) -> list[ProjectView]:
        if is_platform_admin:
            projects = await self._repo.list_all()
        else:
            projects = await self._repo.list_for_user(user_id)
        return [self._to_view(p) for p in projects]

    async def update_project(
        self,
        project_id: str,
        *,
        name: str | None = None,
        description: str | None = None,
    ) -> ProjectView | None:
        updated = await self._repo.update(project_id, name=name, description=description)
        return self._to_view(updated) if updated else None

    async def archive_project(self, project_id: str) -> ProjectView | None:
        project = await self._repo.set_status(project_id, ProjectStatus.ARCHIVED)
        return self._to_view(project) if project else None

    async def restore_project(self, project_id: str) -> ProjectView | None:
        project = await self._repo.set_status(project_id, ProjectStatus.ACTIVE)
        return self._to_view(project) if project else None

    async def delete_project(self, project_id: str) -> bool:
        project = await self._repo.set_status(project_id, ProjectStatus.DELETED)
        return project is not None

    async def get_member(self, project_id: str, user_id: str) -> ProjectMemberView | None:
        member = await self._repo.get_member(project_id, user_id)
        return self._to_member_view(member) if member else None

    async def list_members(self, project_id: str) -> list[ProjectMemberView]:
        members = await self._repo.list_members(project_id)
        return [self._to_member_view(m) for m in members]

    async def add_member(
        self, project_id: str, user_id: str, role: str = "contributor"
    ) -> ProjectMemberView:
        member = await self._repo.add_member(project_id, user_id, role)
        return self._to_member_view(member)

    async def update_member_role(
        self, project_id: str, user_id: str, role: str
    ) -> ProjectMemberView | None:
        member = await self._repo.update_member_role(project_id, user_id, role)
        return self._to_member_view(member) if member else None

    async def remove_member(self, project_id: str, user_id: str) -> bool:
        return await self._repo.remove_member(project_id, user_id)

    @staticmethod
    def _to_view(project: Project) -> ProjectView:
        return ProjectView(
            id=project.id,
            name=project.name,
            slug=project.slug,
            description=project.description,
            created_by=project.created_by,
            status=(
                project.status.value if hasattr(project.status, "value") else str(project.status)
            ),
            created_at=project.created_at.isoformat(),
            updated_at=project.updated_at.isoformat(),
        )

    @staticmethod
    def _to_member_view(member: ProjectMember) -> ProjectMemberView:
        return ProjectMemberView(
            id=member.id,
            project_id=member.project_id,
            user_id=member.user_id,
            role=member.role,
            created_at=member.created_at.isoformat(),
        )


def slugify(name: str) -> str:
    value = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    value = value.lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    value = value.strip("-")
    return value or "project"
