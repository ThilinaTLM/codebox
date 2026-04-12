"""Per-user GitHub API client manager.

Creates, caches, and invalidates ``GitHubApiClient`` instances based on
each user's encrypted GitHub App configuration stored in ``user_settings``.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from codebox_orchestrator.shared.crypto import decrypt_value

if TYPE_CHECKING:
    from codebox_orchestrator.integration.github.application.installation_service import (
        GitHubInstallationService,
    )
    from codebox_orchestrator.integration.github.infrastructure.github_api_client import (
        GitHubApiClient,
    )
    from codebox_orchestrator.integration.github.infrastructure.github_repository import (
        SqlAlchemyGitHubRepository,
    )
    from codebox_orchestrator.user_settings.models import UserSettings
    from codebox_orchestrator.user_settings.repository import UserSettingsRepository

logger = logging.getLogger(__name__)


class GitHubClientManager:
    """Manages per-user ``GitHubApiClient`` and ``GitHubInstallationService`` instances."""

    def __init__(
        self,
        settings_repo: UserSettingsRepository,
        github_repo: SqlAlchemyGitHubRepository,
    ) -> None:
        self._settings_repo = settings_repo
        self._github_repo = github_repo
        self._clients: dict[str, GitHubApiClient] = {}
        self._services: dict[str, GitHubInstallationService] = {}
        # Cache of raw UserSettings for quick non-async lookups
        self._settings_cache: dict[str, UserSettings] = {}

    async def get_client(self, user_id: str) -> GitHubApiClient | None:
        """Get or create a client for *user_id*.

        Returns ``None`` if the user has no GitHub config.
        """
        if user_id in self._clients:
            return self._clients[user_id]

        settings = await self._settings_repo.get(user_id)
        if settings is None or not settings.github_app_id or not settings.github_private_key_enc:
            return None

        self._settings_cache[user_id] = settings
        return self._build_client(user_id, settings)

    async def get_client_for_webhook(self, user_id: str) -> tuple[Any | None, str | None]:
        """Return ``(client, webhook_secret)`` for HMAC verification + processing.

        Returns ``(None, None)`` if the user has no GitHub config.
        """
        settings = await self._settings_repo.get(user_id)
        if (
            settings is None
            or not settings.github_app_id
            or not settings.github_webhook_secret_enc
        ):
            return None, None

        self._settings_cache[user_id] = settings
        client = self._build_client(user_id, settings)
        webhook_secret = decrypt_value(settings.github_webhook_secret_enc)
        return client, webhook_secret

    def get_installation_service(self, user_id: str) -> GitHubInstallationService | None:
        """Return a cached ``GitHubInstallationService`` for the user.

        Must be called after ``get_client()`` so the client is available.
        """
        if user_id in self._services:
            return self._services[user_id]

        client = self._clients.get(user_id)
        if client is None:
            return None

        from codebox_orchestrator.integration.github.application.installation_service import (  # noqa: PLC0415
            GitHubInstallationService,
        )

        service = GitHubInstallationService(client, self._github_repo, user_id=user_id)
        self._services[user_id] = service
        return service

    def get_user_settings(self, user_id: str) -> UserSettings | None:
        """Return cached UserSettings for the user (sync, no DB call)."""
        return self._settings_cache.get(user_id)

    def invalidate(self, user_id: str) -> None:
        """Clear cached client and service when user updates their GitHub config."""
        self._clients.pop(user_id, None)
        self._services.pop(user_id, None)
        self._settings_cache.pop(user_id, None)

    def _build_client(self, user_id: str, settings: Any) -> GitHubApiClient:
        if user_id in self._clients:
            return self._clients[user_id]

        from codebox_orchestrator.integration.github.infrastructure.github_api_client import (  # noqa: PLC0415
            GitHubApiClient,
        )

        client = GitHubApiClient(
            app_id=settings.github_app_id,
            private_key=decrypt_value(settings.github_private_key_enc),
            webhook_secret=decrypt_value(settings.github_webhook_secret_enc).encode()
            if settings.github_webhook_secret_enc
            else b"",
            app_slug=settings.github_app_slug or "codebox",
            bot_name=settings.github_bot_name or settings.github_app_slug or "codebox",
        )
        self._clients[user_id] = client
        return client
