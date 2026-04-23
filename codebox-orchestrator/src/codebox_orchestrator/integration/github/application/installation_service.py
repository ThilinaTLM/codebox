"""GitHub installation management service (project-scoped)."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from codebox_orchestrator.integration.github.domain.entities import GitHubInstallation
    from codebox_orchestrator.integration.github.infrastructure.github_api_client import (
        GitHubApiClient,
    )
    from codebox_orchestrator.integration.github.infrastructure.github_repository import (
        SqlAlchemyGitHubRepository,
    )


class GitHubInstallationService:
    def __init__(
        self,
        api_client: GitHubApiClient,
        repo: SqlAlchemyGitHubRepository,
        *,
        project_id: str,
    ) -> None:
        self._api = api_client
        self._repo = repo
        self._project_id = project_id

    async def list_installations(self) -> list[GitHubInstallation]:
        return await self._repo.list_installations(self._project_id)

    async def get_installation(self, installation_id: str) -> GitHubInstallation | None:
        return await self._repo.get_installation(installation_id)

    async def delete_installation(self, installation_id: str) -> bool:
        return await self._repo.delete_installation(installation_id, project_id=self._project_id)

    async def delete_all_installations(self) -> int:
        return await self._repo.delete_all_installations(self._project_id)

    async def store_installation(
        self, installation_id: int, account_login: str, account_type: str
    ) -> GitHubInstallation:
        return await self._repo.store_installation(
            installation_id, account_login, account_type, project_id=self._project_id
        )

    async def sync_repos(self, installation_id: int) -> list[dict]:
        return await self._api.sync_installation_repos(installation_id)

    async def list_branches(self, repo: str) -> list[dict] | None:
        """List branches for ``owner/name``.

        Returns ``None`` when no installation in this project covers the
        owner; otherwise returns the GitHub branch list. An empty list is
        returned on transient errors so the caller can render an empty
        picker instead of failing the wizard.
        """
        if "/" not in repo:
            return None
        owner = repo.split("/", 1)[0]
        installations = await self._repo.list_installations(self._project_id)
        # Prefer an installation whose account matches the owner prefix, fall
        # back to any installation so users can still pick a branch of a repo
        # their first installation covers transitively.
        match = next(
            (inst for inst in installations if inst.account_login.lower() == owner.lower()),
            None,
        )
        if match is None and installations:
            match = installations[0]
        if match is None:
            return None
        try:
            return await self._api.list_repo_branches(match.installation_id, repo)
        except Exception:
            return []

    async def fetch_and_store(self, installation_id: int) -> GitHubInstallation:
        info = await self._api.fetch_installation_info(installation_id)
        account = info.get("account", {})
        return await self._repo.store_installation(
            installation_id=installation_id,
            account_login=account.get("login", ""),
            account_type=account.get("type", "User"),
            project_id=self._project_id,
        )

    async def get_token(self, installation_id: int) -> str:
        return await self._api.get_installation_token(installation_id)
