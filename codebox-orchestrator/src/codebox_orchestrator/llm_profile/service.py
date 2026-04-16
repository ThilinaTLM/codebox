"""Business logic for LLM profiles — encryption, ownership, masking."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from codebox_orchestrator.shared.crypto import (
    decrypt_value,
    decrypt_value_with_password,
    encrypt_value,
    encrypt_value_with_password,
    mask_secret,
)

if TYPE_CHECKING:
    from codebox_orchestrator.llm_profile.models import LLMProfile
    from codebox_orchestrator.llm_profile.repository import LLMProfileRepository


@dataclass
class LLMProfileView:
    """Read-only representation returned to callers (API key masked)."""

    id: str
    project_id: str
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
        self, project_id: str, *, default_profile_id: str | None = None
    ) -> list[LLMProfileView]:
        profiles = await self._repo.list_by_project(project_id)
        return [self._to_view(p, default_profile_id) for p in profiles]

    async def get_profile(
        self, profile_id: str, project_id: str, *, default_profile_id: str | None = None
    ) -> LLMProfileView | None:
        profile = await self._repo.get_by_id(profile_id)
        if profile is None or profile.project_id != project_id:
            return None
        return self._to_view(profile, default_profile_id)

    async def resolve_profile(self, profile_id: str, project_id: str) -> ResolvedProfile | None:
        """Decrypt and return full profile for internal use. Returns None if not found/owned."""
        profile = await self._repo.get_by_id(profile_id)
        if profile is None or profile.project_id != project_id:
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
        project_id: str,
        name: str,
        provider: str,
        model: str,
        api_key: str,
        base_url: str | None = None,
    ) -> LLMProfileView:
        api_key_enc = encrypt_value(api_key)
        profile = await self._repo.create(
            project_id=project_id,
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
        project_id: str,
        *,
        name: str | None = None,
        provider: str | None = None,
        model: str | None = None,
        api_key: str | None = None,
        base_url: str | None = None,
    ) -> LLMProfileView | None:
        profile = await self._repo.get_by_id(profile_id)
        if profile is None or profile.project_id != project_id:
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

    async def duplicate_profile(
        self,
        profile_id: str,
        project_id: str,
    ) -> LLMProfileView | None:
        """Create a copy of an existing profile with '- copy' name suffix."""
        source = await self._repo.get_by_id(profile_id)
        if source is None or source.project_id != project_id:
            return None

        existing = await self._repo.list_by_project(project_id)
        existing_names = {p.name for p in existing}
        new_name = self._unique_name(source.name, existing_names, " - copy")

        profile = await self._repo.create(
            project_id=project_id,
            name=new_name,
            provider=source.provider,
            model=source.model,
            api_key_enc=source.api_key_enc,
            base_url=source.base_url,
        )
        return self._to_view(profile, default_profile_id=None)

    # ── Export / Import ──────────────────────────────────

    async def export_profiles(
        self,
        project_id: str,
        *,
        profile_ids: list[str] | None = None,
        key_mode: str = "no_keys",
        password: str | None = None,
    ) -> dict:
        """Build an export payload for the given profiles."""
        import base64  # noqa: PLC0415
        import os  # noqa: PLC0415
        from datetime import UTC, datetime  # noqa: PLC0415

        if key_mode == "password_encrypted" and not password:
            raise ValueError("Password is required for password-encrypted export")

        all_profiles = await self._repo.list_by_project(project_id)
        if profile_ids is not None:
            id_set = set(profile_ids)
            all_profiles = [p for p in all_profiles if p.id in id_set]

        salt: bytes | None = None
        iterations = 600_000
        if key_mode == "password_encrypted":
            salt = os.urandom(16)

        entries: list[dict] = []
        for p in all_profiles:
            api_key_value: str | None = None
            if key_mode == "plaintext":
                api_key_value = decrypt_value(p.api_key_enc)
            elif key_mode == "password_encrypted":
                assert salt is not None
                plaintext_key = decrypt_value(p.api_key_enc)
                api_key_value = encrypt_value_with_password(
                    plaintext_key,
                    password,
                    salt,
                    iterations,  # type: ignore[arg-type]
                )
            entries.append(
                {
                    "name": p.name,
                    "provider": p.provider,
                    "model": p.model,
                    "api_key": api_key_value,
                    "base_url": p.base_url,
                }
            )

        result: dict = {
            "version": 1,
            "exported_at": datetime.now(UTC).isoformat(),
            "key_mode": key_mode,
            "profiles": entries,
        }
        if key_mode == "password_encrypted" and salt is not None:
            result["key_params"] = {
                "salt": base64.b64encode(salt).decode(),
                "iterations": iterations,
            }
        return result

    async def import_profiles(
        self,
        project_id: str,
        *,
        export_data: dict,
        password: str | None = None,
    ) -> tuple[list[LLMProfileView], int]:
        """Import profiles from an export payload."""
        import base64  # noqa: PLC0415

        key_mode = export_data.get("key_mode", "no_keys")
        profiles_data = export_data.get("profiles", [])
        key_params = export_data.get("key_params")

        if key_mode == "password_encrypted" and not password:
            raise ValueError("Password is required to import password-encrypted profiles")

        salt: bytes | None = None
        iterations = 600_000
        if key_mode == "password_encrypted" and key_params:
            salt = base64.b64decode(key_params["salt"])
            iterations = key_params.get("iterations", 600_000)

        existing = await self._repo.list_by_project(project_id)
        existing_names = {p.name for p in existing}

        created: list[LLMProfileView] = []
        skipped = 0

        for entry in profiles_data:
            raw_key: str | None = entry.get("api_key")

            plaintext_key: str | None = None
            if key_mode == "plaintext" and raw_key:
                plaintext_key = raw_key
            elif key_mode == "password_encrypted" and raw_key:
                assert salt is not None
                plaintext_key = decrypt_value_with_password(
                    raw_key,
                    password,
                    salt,
                    iterations,  # type: ignore[arg-type]
                )

            if plaintext_key is None:
                skipped += 1
                continue

            name = entry["name"]
            if name in existing_names:
                name = self._unique_name(name, existing_names, " - imported")
            existing_names.add(name)

            profile = await self._repo.create(
                project_id=project_id,
                name=name,
                provider=entry["provider"],
                model=entry["model"],
                api_key_enc=encrypt_value(plaintext_key),
                base_url=entry.get("base_url"),
            )
            created.append(self._to_view(profile, default_profile_id=None))

        return created, skipped

    async def delete_profile(self, profile_id: str, project_id: str) -> bool:
        profile = await self._repo.get_by_id(profile_id)
        if profile is None or profile.project_id != project_id:
            return False
        return await self._repo.delete(profile_id)

    # ── Helpers ─────────────────────────────────────────

    @staticmethod
    def _unique_name(base_name: str, existing_names: set[str], suffix: str = " - copy") -> str:
        candidate = f"{base_name}{suffix}"
        counter = 2
        while candidate in existing_names:
            candidate = f"{base_name}{suffix} {counter}"
            counter += 1
        return candidate

    def _to_view(self, profile: LLMProfile, default_profile_id: str | None) -> LLMProfileView:
        decrypted_key = decrypt_value(profile.api_key_enc)
        return LLMProfileView(
            id=profile.id,
            project_id=profile.project_id,
            name=profile.name,
            provider=profile.provider,
            model=profile.model,
            api_key_masked=mask_secret(decrypted_key),
            base_url=profile.base_url,
            is_default=profile.id == default_profile_id,
            created_at=profile.created_at.isoformat(),
            updated_at=profile.updated_at.isoformat(),
        )
