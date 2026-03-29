"""GitHub installation management service."""

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
    def __init__(self, api_client: GitHubApiClient, repo: SqlAlchemyGitHubRepository) -> None:
        self._api = api_client
        self._repo = repo

    async def list_installations(self) -> list[GitHubInstallation]:
        return await self._repo.list_installations()

    async def get_installation(self, installation_id: str) -> GitHubInstallation | None:
        return await self._repo.get_installation(installation_id)

    async def delete_installation(self, installation_id: str) -> bool:
        return await self._repo.delete_installation(installation_id)

    async def store_installation(
        self, installation_id: int, account_login: str, account_type: str
    ) -> GitHubInstallation:
        return await self._repo.store_installation(installation_id, account_login, account_type)

    async def sync_repos(self, installation_id: int) -> list[dict]:
        return await self._api.sync_installation_repos(installation_id)

    async def fetch_and_store(self, installation_id: int) -> GitHubInstallation:
        info = await self._api.fetch_installation_info(installation_id)
        account = info.get("account", {})
        return await self._repo.store_installation(
            installation_id=installation_id,
            account_login=account.get("login", ""),
            account_type=account.get("type", "User"),
        )

    async def get_token(self, installation_id: int) -> str:
        return await self._api.get_installation_token(installation_id)
