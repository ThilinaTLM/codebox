"""Business logic for project management."""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from typing import TYPE_CHECKING

from fastapi import HTTPException

from codebox_orchestrator.project.models import Project, ProjectStatus

if TYPE_CHECKING:
    from codebox_orchestrator.auth.models import User
    from codebox_orchestrator.box.application.commands.delete_box import DeleteBoxHandler
    from codebox_orchestrator.box.infrastructure.box_repository import BoxRepository
    from codebox_orchestrator.box.ports.event_publisher import EventPublisher
    from codebox_orchestrator.llm_profile.repository import LLMProfileRepository
    from codebox_orchestrator.project.models import ProjectMember
    from codebox_orchestrator.project.repository import ProjectRepository


_VALID_MEMBER_ROLES = frozenset({"admin", "contributor"})


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
class ProjectUserSummaryView:
    id: str
    username: str
    first_name: str | None
    last_name: str | None
    status: str


@dataclass
class ProjectMemberView:
    id: str
    project_id: str
    user_id: str
    role: str
    created_at: str
    user: ProjectUserSummaryView


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
        trimmed_name = (name or "").strip()
        if not trimmed_name:
            raise HTTPException(status_code=400, detail="Project name is required")

        existing_by_name = await self._repo.find_project_by_name(trimmed_name)
        if existing_by_name is not None:
            raise HTTPException(status_code=409, detail="A project with that name already exists")

        slug = slugify(trimmed_name)
        existing_by_slug = await self._repo.find_project_by_slug(slug)
        if existing_by_slug is not None:
            raise HTTPException(
                status_code=409,
                detail="A project with a conflicting slug already exists",
            )

        project = Project(
            name=trimmed_name,
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
        if name is not None:
            trimmed_name = name.strip()
            if not trimmed_name:
                raise HTTPException(status_code=400, detail="Project name cannot be empty")
            existing = await self._repo.find_project_by_name(trimmed_name, exclude_id=project_id)
            if existing is not None:
                raise HTTPException(
                    status_code=409,
                    detail="A project with that name already exists",
                )
            name = trimmed_name

        updated = await self._repo.update(project_id, name=name, description=description)
        return self._to_view(updated) if updated else None

    async def get_member(self, project_id: str, user_id: str) -> ProjectMemberView | None:
        row = await self._repo.get_member_with_user(project_id, user_id)
        if row is None:
            return None
        return self._to_member_view(row[0], row[1])

    async def list_members(self, project_id: str) -> list[ProjectMemberView]:
        rows = await self._repo.list_members_with_users(project_id)
        return [self._to_member_view(m, u) for m, u in rows]

    async def add_member(
        self, project_id: str, user_id: str, role: str = "contributor"
    ) -> ProjectMemberView:
        if role not in _VALID_MEMBER_ROLES:
            raise HTTPException(status_code=400, detail="Invalid member role")
        user = await self._repo.get_active_user(user_id)
        if user is None:
            raise HTTPException(status_code=400, detail="User does not exist or is not active")
        existing = await self._repo.get_member(project_id, user_id)
        if existing is not None:
            raise HTTPException(status_code=409, detail="User is already a member of this project")
        member = await self._repo.add_member(project_id, user_id, role)
        return self._to_member_view(member, user)

    async def update_member_role(
        self, project_id: str, user_id: str, role: str
    ) -> ProjectMemberView | None:
        if role not in _VALID_MEMBER_ROLES:
            raise HTTPException(status_code=400, detail="Invalid member role")
        current = await self._repo.get_member_with_user(project_id, user_id)
        if current is None:
            return None
        current_member, current_user = current
        if current_member.role == "admin" and role != "admin":
            admin_count = await self._repo.count_members_by_role(project_id, "admin")
            if admin_count <= 1:
                raise HTTPException(
                    status_code=400,
                    detail="Cannot demote the last project admin",
                )
        if current_member.role == role:
            return self._to_member_view(current_member, current_user)
        updated = await self._repo.update_member_role(project_id, user_id, role)
        if updated is None:
            return None
        return self._to_member_view(updated, current_user)

    async def remove_member(self, project_id: str, user_id: str) -> bool:
        current = await self._repo.get_member(project_id, user_id)
        if current is None:
            return False
        if current.role == "admin":
            admin_count = await self._repo.count_members_by_role(project_id, "admin")
            if admin_count <= 1:
                raise HTTPException(
                    status_code=400,
                    detail="Cannot remove the last project admin",
                )
        return await self._repo.remove_member(project_id, user_id)

    async def search_member_candidates(
        self, project_id: str, *, query: str | None = None, limit: int = 20
    ) -> list[ProjectUserSummaryView]:
        limit = max(1, min(limit, 50))
        users = await self._repo.search_member_candidates(project_id, query=query, limit=limit)
        return [_user_to_summary(u) for u in users]

    @staticmethod
    def _to_view(project: Project) -> ProjectView:
        return project_to_view(project)

    @staticmethod
    def _to_member_view(member: ProjectMember, user: User) -> ProjectMemberView:
        return ProjectMemberView(
            id=member.id,
            project_id=member.project_id,
            user_id=member.user_id,
            role=member.role,
            created_at=member.created_at.isoformat(),
            user=_user_to_summary(user),
        )


class ProjectLifecycleService:
    """Project lifecycle operations that affect child resources and runtime state."""

    def __init__(
        self,
        repo: ProjectRepository,
        box_repo: BoxRepository,
        llm_profile_repo: LLMProfileRepository,
        delete_box_handler: DeleteBoxHandler,
        publisher: EventPublisher,
    ) -> None:
        self._repo = repo
        self._box_repo = box_repo
        self._llm_profile_repo = llm_profile_repo
        self._delete_box_handler = delete_box_handler
        self._publisher = publisher

    async def archive(self, project_id: str) -> ProjectView | None:
        project = await self._repo.set_status(project_id, ProjectStatus.ARCHIVED)
        if project is None:
            return None
        await self._publisher.publish_global_event(
            {"type": "project_archived", "project_id": project_id, "slug": project.slug}
        )
        return project_to_view(project)

    async def restore(self, project_id: str) -> ProjectView | None:
        project = await self._repo.set_status(project_id, ProjectStatus.ACTIVE)
        if project is None:
            return None
        await self._publisher.publish_global_event(
            {"type": "project_restored", "project_id": project_id, "slug": project.slug}
        )
        return project_to_view(project)

    async def delete(self, project_id: str) -> ProjectView | None:
        project = await self._repo.set_status(project_id, ProjectStatus.DELETED)
        if project is None:
            return None

        boxes = await self._box_repo.list_for_project(project_id)
        for box in boxes:
            await self._delete_box_handler.execute(box.id)

        await self._llm_profile_repo.soft_delete_by_project(project_id)
        await self._publisher.publish_global_event(
            {"type": "project_deleted", "project_id": project_id, "slug": project.slug}
        )
        return project_to_view(project)


def project_to_view(project: Project) -> ProjectView:
    return ProjectView(
        id=project.id,
        name=project.name,
        slug=project.slug,
        description=project.description,
        created_by=project.created_by,
        status=(project.status.value if hasattr(project.status, "value") else str(project.status)),
        created_at=project.created_at.isoformat(),
        updated_at=project.updated_at.isoformat(),
    )


def _user_to_summary(user: User) -> ProjectUserSummaryView:
    status_value = user.status.value if hasattr(user.status, "value") else str(user.status)
    return ProjectUserSummaryView(
        id=user.id,
        username=user.username,
        first_name=user.first_name,
        last_name=user.last_name,
        status=status_value,
    )


def slugify(name: str) -> str:
    value = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    value = value.lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    value = value.strip("-")
    return value or "project"
