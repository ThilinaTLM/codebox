"""REST API routes for per-project settings (project-scoped)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import APIRouter, Depends

from codebox_orchestrator.api.dependencies import get_project_settings_service
from codebox_orchestrator.api.schemas import ProjectSettingsResponse, ProjectSettingsUpdate
from codebox_orchestrator.project.dependencies import (
    ProjectContext,
    get_project_context,
    require_project_admin,
)

if TYPE_CHECKING:
    from codebox_orchestrator.project_settings.service import ProjectSettingsService

router = APIRouter(prefix="/api/projects/{slug}")


@router.get("/settings")
async def get_settings(
    ctx: ProjectContext = Depends(get_project_context),
    service: ProjectSettingsService = Depends(get_project_settings_service),
) -> ProjectSettingsResponse:
    view = await service.get_settings(ctx.project_id)
    if view is None:
        return ProjectSettingsResponse()
    return ProjectSettingsResponse(
        default_llm_profile_id=view.default_llm_profile_id,
        tavily_api_key_masked=view.tavily_api_key_masked,
        github_app_id=view.github_app_id,
        github_private_key_masked=view.github_private_key_masked,
        github_webhook_secret_masked=view.github_webhook_secret_masked,
        github_app_slug=view.github_app_slug,
        github_bot_name=view.github_bot_name,
        github_default_base_branch=view.github_default_base_branch,
    )


@router.patch("/settings")
async def update_settings(
    body: ProjectSettingsUpdate,
    ctx: ProjectContext = Depends(require_project_admin),
    service: ProjectSettingsService = Depends(get_project_settings_service),
) -> ProjectSettingsResponse:
    view = await service.update_settings(ctx.project_id, **body.model_dump(exclude_unset=True))
    return ProjectSettingsResponse(
        default_llm_profile_id=view.default_llm_profile_id,
        tavily_api_key_masked=view.tavily_api_key_masked,
        github_app_id=view.github_app_id,
        github_private_key_masked=view.github_private_key_masked,
        github_webhook_secret_masked=view.github_webhook_secret_masked,
        github_app_slug=view.github_app_slug,
        github_bot_name=view.github_bot_name,
        github_default_base_branch=view.github_default_base_branch,
    )
