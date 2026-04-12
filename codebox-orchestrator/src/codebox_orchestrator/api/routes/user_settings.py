"""REST API routes for per-user settings."""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import APIRouter, Depends

from codebox_orchestrator.api.dependencies import get_user_settings_service
from codebox_orchestrator.api.schemas import UserSettingsResponse, UserSettingsUpdate
from codebox_orchestrator.auth.dependencies import UserInfo, get_current_user

if TYPE_CHECKING:
    from codebox_orchestrator.user_settings.service import UserSettingsService

router = APIRouter(prefix="/api/user")


@router.get("/settings")
async def get_settings(
    user: UserInfo = Depends(get_current_user),
    service: UserSettingsService = Depends(get_user_settings_service),
) -> UserSettingsResponse:
    view = await service.get_settings(user.user_id)
    if view is None:
        return UserSettingsResponse()
    return UserSettingsResponse.model_validate(view.__dict__)


@router.patch("/settings")
async def update_settings(
    body: UserSettingsUpdate,
    user: UserInfo = Depends(get_current_user),
    service: UserSettingsService = Depends(get_user_settings_service),
) -> UserSettingsResponse:
    update_fields = body.model_dump(exclude_unset=True)
    view = await service.update_settings(user.user_id, **update_fields)
    return UserSettingsResponse.model_validate(view.__dict__)
