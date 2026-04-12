"""Business logic for LLM profiles — encryption, ownership, masking."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from codebox_orchestrator.shared.crypto import decrypt_value, encrypt_value, mask_secret

if TYPE_CHECKING:
    from codebox_orchestrator.llm_profile.models import LLMProfile
    from codebox_orchestrator.llm_profile.repository import LLMProfileRepository


@dataclass
class LLMProfileView:
    """Read-only representation returned to callers (API key masked)."""

    id: str
    user_id: str
    name: str
    provider: str
    model: str
    api_key_masked: str
    base_url: str | None
    is_default: bool
    created_at: str
    updated_at: str


@dataclass
class ResolvedProfile:
    """Fully decrypted profile data for internal use (e.g. container injection)."""

    id: str
    provider: str
    model: str
    api_key: str
    base_url: str | None


class LLMProfileService:
    def __init__(self, repo: LLMProfileRepository) -> None:
        self._repo = repo

    # ── Queries ─────────────────────────────────────────────

    async def list_profiles(
        self, user_id: str, *, default_profile_id: str | None = None
    ) -> list[LLMProfileView]:
        profiles = await self._repo.list_by_user(user_id)
        return [self._to_view(p, default_profile_id) for p in profiles]

    async def get_profile(
        self, profile_id: str, user_id: str, *, default_profile_id: str | None = None
    ) -> LLMProfileView | None:
        profile = await self._repo.get_by_id(profile_id)
        if profile is None or profile.user_id != user_id:
            return None
        return self._to_view(profile, default_profile_id)

    async def resolve_profile(self, profile_id: str, user_id: str) -> ResolvedProfile | None:
        """Decrypt and return full profile for internal use. Returns None if not found/owned."""
        profile = await self._repo.get_by_id(profile_id)
        if profile is None or profile.user_id != user_id:
            return None
        return ResolvedProfile(
            id=profile.id,
            provider=profile.provider,
            model=profile.model,
            api_key=decrypt_value(profile.api_key_enc),
            base_url=profile.base_url,
        )

    # ── Commands ────────────────────────────────────────────

    async def create_profile(
        self,
        *,
        user_id: str,
        name: str,
        provider: str,
        model: str,
        api_key: str,
        base_url: str | None = None,
    ) -> LLMProfileView:
        api_key_enc = encrypt_value(api_key)
        profile = await self._repo.create(
            user_id=user_id,
            name=name,
            provider=provider,
            model=model,
            api_key_enc=api_key_enc,
            base_url=base_url,
        )
        return self._to_view(profile, default_profile_id=None)

    async def update_profile(
        self,
        profile_id: str,
        user_id: str,
        *,
        name: str | None = None,
        provider: str | None = None,
        model: str | None = None,
        api_key: str | None = None,
        base_url: str | None = None,
    ) -> LLMProfileView | None:
        profile = await self._repo.get_by_id(profile_id)
        if profile is None or profile.user_id != user_id:
            return None

        if name is not None:
            profile.name = name
        if provider is not None:
            profile.provider = provider
        if model is not None:
            profile.model = model
        if api_key:
            profile.api_key_enc = encrypt_value(api_key)
        if base_url is not None:
            profile.base_url = base_url or None

        updated = await self._repo.update(profile)
        return self._to_view(updated, default_profile_id=None)

    async def delete_profile(self, profile_id: str, user_id: str) -> bool:
        profile = await self._repo.get_by_id(profile_id)
        if profile is None or profile.user_id != user_id:
            return False
        return await self._repo.delete(profile_id)

    # ── Helpers ─────────────────────────────────────────────

    def _to_view(self, profile: LLMProfile, default_profile_id: str | None) -> LLMProfileView:
        decrypted_key = decrypt_value(profile.api_key_enc)
        return LLMProfileView(
            id=profile.id,
            user_id=profile.user_id,
            name=profile.name,
            provider=profile.provider,
            model=profile.model,
            api_key_masked=mask_secret(decrypted_key),
            base_url=profile.base_url,
            is_default=profile.id == default_profile_id,
            created_at=profile.created_at.isoformat(),
            updated_at=profile.updated_at.isoformat(),
        )
