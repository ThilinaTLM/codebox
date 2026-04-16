"""Async repository for project persistence."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import delete, select

from codebox_orchestrator.project.models import Project, ProjectMember, ProjectStatus

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import async_sessionmaker


class ProjectRepository:
    def __init__(self, session_factory: async_sessionmaker) -> None:
        self._session_factory = session_factory

    async def create(self, project: Project, *, creator_role: str = "admin") -> Project:
        """Insert a project and add the creator as a member."""
        async with self._session_factory() as session:
            session.add(project)
            await session.flush()
            member = ProjectMember(
                project_id=project.id,
                user_id=project.created_by,
                role=creator_role,
            )
            session.add(member)
            await session.commit()
            await session.refresh(project)
            return project

    async def get_by_slug(
        self,
        slug: str,
        *,
        include_archived: bool = True,
        include_deleted: bool = False,
    ) -> Project | None:
        async with self._session_factory() as session:
            stmt = select(Project).where(Project.slug == slug)
            if not include_deleted:
                stmt = stmt.where(Project.status != ProjectStatus.DELETED)
            if not include_archived:
                stmt = stmt.where(Project.status == ProjectStatus.ACTIVE)
            result = await session.execute(stmt)
            return result.scalar_one_or_none()

    async def get_by_id(
        self,
        project_id: str,
        *,
        include_archived: bool = True,
        include_deleted: bool = False,
    ) -> Project | None:
        async with self._session_factory() as session:
            stmt = select(Project).where(Project.id == project_id)
            if not include_deleted:
                stmt = stmt.where(Project.status != ProjectStatus.DELETED)
            if not include_archived:
                stmt = stmt.where(Project.status == ProjectStatus.ACTIVE)
            result = await session.execute(stmt)
            return result.scalar_one_or_none()

    async def list_for_user(
        self,
        user_id: str,
        *,
        include_archived: bool = False,
        include_deleted: bool = False,
    ) -> list[Project]:
        async with self._session_factory() as session:
            stmt = (
                select(Project)
                .join(ProjectMember, ProjectMember.project_id == Project.id)
                .where(ProjectMember.user_id == user_id)
                .order_by(Project.name)
            )
            if not include_deleted:
                stmt = stmt.where(Project.status != ProjectStatus.DELETED)
            if not include_archived:
                stmt = stmt.where(Project.status == ProjectStatus.ACTIVE)
            result = await session.execute(stmt)
            return list(result.scalars().all())

    async def list_all(
        self,
        *,
        include_archived: bool = True,
        include_deleted: bool = False,
    ) -> list[Project]:
        async with self._session_factory() as session:
            stmt = select(Project)
            if not include_deleted:
                stmt = stmt.where(Project.status != ProjectStatus.DELETED)
            if not include_archived:
                stmt = stmt.where(Project.status == ProjectStatus.ACTIVE)
            stmt = stmt.order_by(Project.name)
            result = await session.execute(stmt)
            return list(result.scalars().all())

    async def update(
        self,
        project_id: str,
        *,
        name: str | None = None,
        description: str | None = None,
    ) -> Project | None:
        async with self._session_factory() as session:
            stmt = select(Project).where(
                Project.id == project_id,
                Project.status != ProjectStatus.DELETED,
            )
            result = await session.execute(stmt)
            project = result.scalar_one_or_none()
            if project is None:
                return None
            if name is not None:
                project.name = name
            if description is not None:
                project.description = description
            project.updated_at = datetime.now(UTC)
            await session.commit()
            await session.refresh(project)
            return project

    async def set_status(self, project_id: str, status: ProjectStatus) -> Project | None:
        async with self._session_factory() as session:
            project = await session.get(Project, project_id)
            if project is None:
                return None
            project.status = status
            project.updated_at = datetime.now(UTC)
            await session.commit()
            await session.refresh(project)
            return project

    async def hard_delete(self, project_id: str) -> bool:
        async with self._session_factory() as session:
            project = await session.get(Project, project_id)
            if project is None:
                return False
            await session.execute(
                delete(ProjectMember).where(ProjectMember.project_id == project_id)
            )
            await session.delete(project)
            await session.commit()
            return True

    async def get_member(self, project_id: str, user_id: str) -> ProjectMember | None:
        async with self._session_factory() as session:
            result = await session.execute(
                select(ProjectMember).where(
                    ProjectMember.project_id == project_id,
                    ProjectMember.user_id == user_id,
                )
            )
            return result.scalar_one_or_none()

    async def list_members(self, project_id: str) -> list[ProjectMember]:
        async with self._session_factory() as session:
            result = await session.execute(
                select(ProjectMember)
                .where(ProjectMember.project_id == project_id)
                .order_by(ProjectMember.created_at)
            )
            return list(result.scalars().all())

    async def add_member(
        self, project_id: str, user_id: str, role: str = "contributor"
    ) -> ProjectMember:
        member = ProjectMember(project_id=project_id, user_id=user_id, role=role)
        async with self._session_factory() as session:
            session.add(member)
            await session.commit()
            await session.refresh(member)
            return member

    async def update_member_role(
        self, project_id: str, user_id: str, role: str
    ) -> ProjectMember | None:
        async with self._session_factory() as session:
            result = await session.execute(
                select(ProjectMember).where(
                    ProjectMember.project_id == project_id,
                    ProjectMember.user_id == user_id,
                )
            )
            member = result.scalar_one_or_none()
            if member is None:
                return None
            member.role = role
            await session.commit()
            await session.refresh(member)
            return member

    async def remove_member(self, project_id: str, user_id: str) -> bool:
        async with self._session_factory() as session:
            result = await session.execute(
                delete(ProjectMember).where(
                    ProjectMember.project_id == project_id,
                    ProjectMember.user_id == user_id,
                )
            )
            await session.commit()
            return (result.rowcount or 0) > 0
