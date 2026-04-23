"""Business logic for per-project settings — encryption, masking, GitHub config."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from codebox_orchestrator.shared.crypto import decrypt_value, encrypt_value, mask_secret

if TYPE_CHECKING:
    from codebox_orchestrator.project_settings.models import ProjectSettings
    from codebox_orchestrator.project_settings.repository import ProjectSettingsRepository


@dataclass
class ProjectSettingsView:
    """Read-only representation with secrets masked."""

    default_llm_profile_id: str | None
    tavily_api_key_masked: str | None
    github_app_id: str | None
    github_private_key_masked: str | None
    github_webhook_secret_masked: str | None
    github_app_slug: str | None
    github_bot_name: str | None
    github_default_base_branch: str | None


class ProjectSettingsService:
    def __init__(self, repo: ProjectSettingsRepository) -> None:
        self._repo = repo

    # ── Queries ─────────────────────────────────────────────

    async def get_settings(self, project_id: str) -> ProjectSettingsView | None:
        settings = await self._repo.get(project_id)
        if settings is None:
            return None
        return self._to_view(settings)

    async def get_raw(self, project_id: str) -> ProjectSettings | None:
        """Return the raw ORM object (for internal use — encrypted fields intact)."""
        return await self._repo.get(project_id)

    async def get_default_profile_id(self, project_id: str) -> str | None:
        settings = await self._repo.get(project_id)
        return settings.default_llm_profile_id if settings else None

    async def get_tavily_api_key(self, project_id: str) -> str | None:
        """Decrypt and return the Tavily API key, or None."""
        settings = await self._repo.get(project_id)
        if settings and settings.tavily_api_key_enc:
            return decrypt_value(settings.tavily_api_key_enc)
        return None

    def github_configured(self, settings: ProjectSettings | None) -> bool:
        """Return True if the project has a complete GitHub App config."""
        if settings is None:
            return False
        return bool(
            settings.github_app_id
            and settings.github_private_key_enc
            and settings.github_webhook_secret_enc
        )

    # ── Commands ────────────────────────────────────────────

    async def update_settings(self, project_id: str, **kwargs: str | None) -> ProjectSettingsView:
        """Update project settings. Sensitive fields are encrypted before storage."""
        fields: dict[str, object] = {}

        # Direct fields
        for key in (
            "default_llm_profile_id",
            "github_app_id",
            "github_app_slug",
            "github_bot_name",
            "github_default_base_branch",
        ):
            if key in kwargs:
                fields[key] = kwargs[key]

        # Encrypted fields — only update if a non-empty value is provided
        _encrypted_map = {
            "tavily_api_key": "tavily_api_key_enc",
            "github_private_key": "github_private_key_enc",
            "github_webhook_secret": "github_webhook_secret_enc",
        }
        for input_key, db_key in _encrypted_map.items():
            if input_key in kwargs:
                value = kwargs[input_key]
                fields[db_key] = encrypt_value(value) if value else None

        settings = await self._repo.upsert(project_id, **fields)
        return self._to_view(settings)

    async def clear_github_app(self, project_id: str) -> ProjectSettingsView:
        """Wipe the project's GitHub App credentials.

        Used by the "Disconnect & recreate" flow. ``github_default_base_branch``
        is intentionally preserved — it's a project preference, not a credential.
        """
        settings = await self._repo.upsert(
            project_id,
            github_app_id=None,
            github_app_slug=None,
            github_bot_name=None,
            github_private_key_enc=None,
            github_webhook_secret_enc=None,
        )
        return self._to_view(settings)

    async def clear_default_if_matches(self, project_id: str, profile_id: str) -> None:
        """Clear the default LLM profile if it matches *profile_id*."""
        settings = await self._repo.get(project_id)
        if settings and settings.default_llm_profile_id == profile_id:
            await self._repo.upsert(project_id, default_llm_profile_id=None)

    # ── Helpers ─────────────────────────────────────────────

    def _to_view(self, s: ProjectSettings) -> ProjectSettingsView:
        return ProjectSettingsView(
            default_llm_profile_id=s.default_llm_profile_id,
            tavily_api_key_masked=(
                mask_secret(decrypt_value(s.tavily_api_key_enc)) if s.tavily_api_key_enc else None
            ),
            github_app_id=s.github_app_id,
            github_private_key_masked=(
                mask_secret(decrypt_value(s.github_private_key_enc))
                if s.github_private_key_enc
                else None
            ),
            github_webhook_secret_masked=(
                mask_secret(decrypt_value(s.github_webhook_secret_enc))
                if s.github_webhook_secret_enc
                else None
            ),
            github_app_slug=s.github_app_slug,
            github_bot_name=s.github_bot_name,
            github_default_base_branch=s.github_default_base_branch,
        )
