"""REST API routes for LLM profile management."""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import APIRouter, Depends, HTTPException

from codebox_orchestrator.api.dependencies import (
    get_llm_profile_service,
    get_user_settings_service,
)
from codebox_orchestrator.api.schemas import (
    LLMProfileCreate,
    LLMProfileResponse,
    LLMProfileUpdate,
)
from codebox_orchestrator.auth.dependencies import UserInfo, get_current_user

if TYPE_CHECKING:
    from codebox_orchestrator.llm_profile.service import LLMProfileService
    from codebox_orchestrator.user_settings.service import UserSettingsService

router = APIRouter(prefix="/api")


async def _default_profile_id(
    user: UserInfo,
    settings_service: UserSettingsService,
) -> str | None:
    settings = await settings_service.get_settings(user.user_id)
    return settings.default_llm_profile_id if settings else None


@router.get("/llm-profiles")
async def list_profiles(
    user: UserInfo = Depends(get_current_user),
    service: LLMProfileService = Depends(get_llm_profile_service),
    settings_service: UserSettingsService = Depends(get_user_settings_service),
) -> list[LLMProfileResponse]:
    default_id = await _default_profile_id(user, settings_service)
    views = await service.list_profiles(user.user_id, default_profile_id=default_id)
    return [LLMProfileResponse.model_validate(v.__dict__) for v in views]


@router.post("/llm-profiles", status_code=201)
async def create_profile(
    body: LLMProfileCreate,
    user: UserInfo = Depends(get_current_user),
    service: LLMProfileService = Depends(get_llm_profile_service),
) -> LLMProfileResponse:
    view = await service.create_profile(
        user_id=user.user_id,
        name=body.name,
        provider=body.provider,
        model=body.model,
        api_key=body.api_key,
        base_url=body.base_url,
    )
    return LLMProfileResponse.model_validate(view.__dict__)


@router.get("/llm-profiles/{profile_id}")
async def get_profile(
    profile_id: str,
    user: UserInfo = Depends(get_current_user),
    service: LLMProfileService = Depends(get_llm_profile_service),
    settings_service: UserSettingsService = Depends(get_user_settings_service),
) -> LLMProfileResponse:
    default_id = await _default_profile_id(user, settings_service)
    view = await service.get_profile(profile_id, user.user_id, default_profile_id=default_id)
    if view is None:
        raise HTTPException(404, "Profile not found")
    return LLMProfileResponse.model_validate(view.__dict__)


@router.put("/llm-profiles/{profile_id}")
async def update_profile(
    profile_id: str,
    body: LLMProfileUpdate,
    user: UserInfo = Depends(get_current_user),
    service: LLMProfileService = Depends(get_llm_profile_service),
) -> LLMProfileResponse:
    view = await service.update_profile(
        profile_id,
        user.user_id,
        name=body.name,
        provider=body.provider,
        model=body.model,
        api_key=body.api_key,
        base_url=body.base_url,
    )
    if view is None:
        raise HTTPException(404, "Profile not found")
    return LLMProfileResponse.model_validate(view.__dict__)


@router.delete("/llm-profiles/{profile_id}", status_code=204)
async def delete_profile(
    profile_id: str,
    user: UserInfo = Depends(get_current_user),
    service: LLMProfileService = Depends(get_llm_profile_service),
    settings_service: UserSettingsService = Depends(get_user_settings_service),
) -> None:
    deleted = await service.delete_profile(profile_id, user.user_id)
    if not deleted:
        raise HTTPException(404, "Profile not found")
    # Clear default if it was pointing to the deleted profile
    await settings_service.clear_default_if_matches(user.user_id, profile_id)
