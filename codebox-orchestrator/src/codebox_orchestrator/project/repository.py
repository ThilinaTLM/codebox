"""Async repository for project persistence."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import and_, delete, func, or_, select

from codebox_orchestrator.auth.models import User, UserStatus
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

    async def list_members_with_users(self, project_id: str) -> list[tuple[ProjectMember, User]]:
        """Return members joined with their user rows, ordered by membership creation."""
        async with self._session_factory() as session:
            result = await session.execute(
                select(ProjectMember, User)
                .join(User, User.id == ProjectMember.user_id)
                .where(ProjectMember.project_id == project_id)
                .order_by(ProjectMember.created_at)
            )
            return [(m, u) for m, u in result.all()]

    async def get_member_with_user(
        self, project_id: str, user_id: str
    ) -> tuple[ProjectMember, User] | None:
        async with self._session_factory() as session:
            result = await session.execute(
                select(ProjectMember, User)
                .join(User, User.id == ProjectMember.user_id)
                .where(
                    ProjectMember.project_id == project_id,
                    ProjectMember.user_id == user_id,
                )
            )
            row = result.first()
            if row is None:
                return None
            return row[0], row[1]

    async def count_members_by_role(self, project_id: str, role: str) -> int:
        async with self._session_factory() as session:
            result = await session.execute(
                select(func.count(ProjectMember.id)).where(
                    ProjectMember.project_id == project_id,
                    ProjectMember.role == role,
                )
            )
            return int(result.scalar() or 0)

    async def get_active_user(self, user_id: str) -> User | None:
        """Return the user if active; return ``None`` if missing, disabled, or deleted."""
        async with self._session_factory() as session:
            result = await session.execute(
                select(User).where(
                    User.id == user_id,
                    User.status == UserStatus.ACTIVE,
                )
            )
            return result.scalar_one_or_none()

    async def search_member_candidates(
        self,
        project_id: str,
        *,
        query: str | None = None,
        limit: int = 20,
    ) -> list[User]:
        """Search active users that are not already members of ``project_id``.

        Matches ``query`` against username, first name, and last name using a
        case-insensitive substring match. Empty or ``None`` query returns the
        first ``limit`` candidates ordered by username.
        """
        async with self._session_factory() as session:
            existing = select(ProjectMember.user_id).where(ProjectMember.project_id == project_id)
            stmt = (
                select(User)
                .where(
                    User.status == UserStatus.ACTIVE,
                    User.id.not_in(existing),
                )
                .order_by(User.username)
                .limit(limit)
            )
            trimmed = (query or "").strip()
            if trimmed:
                pattern = f"%{trimmed.lower()}%"
                stmt = stmt.where(
                    or_(
                        func.lower(User.username).like(pattern),
                        and_(
                            User.first_name.is_not(None),
                            func.lower(User.first_name).like(pattern),
                        ),
                        and_(
                            User.last_name.is_not(None),
                            func.lower(User.last_name).like(pattern),
                        ),
                    )
                )
            result = await session.execute(stmt)
            return list(result.scalars().all())

    async def find_project_by_name(
        self, name: str, *, exclude_id: str | None = None
    ) -> Project | None:
        async with self._session_factory() as session:
            stmt = select(Project).where(
                func.lower(Project.name) == name.lower(),
                Project.status != ProjectStatus.DELETED,
            )
            if exclude_id is not None:
                stmt = stmt.where(Project.id != exclude_id)
            result = await session.execute(stmt)
            return result.scalar_one_or_none()

    async def find_project_by_slug(
        self, slug: str, *, exclude_id: str | None = None
    ) -> Project | None:
        async with self._session_factory() as session:
            stmt = select(Project).where(
                Project.slug == slug,
                Project.status != ProjectStatus.DELETED,
            )
            if exclude_id is not None:
                stmt = stmt.where(Project.id != exclude_id)
            result = await session.execute(stmt)
            return result.scalar_one_or_none()

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
