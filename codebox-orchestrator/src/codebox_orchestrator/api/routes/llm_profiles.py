"""REST API routes for LLM profile management (project-scoped)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import APIRouter, Depends, HTTPException

from codebox_orchestrator.api.dependencies import (
    get_llm_profile_service,
    get_project_settings_service,
)
from codebox_orchestrator.api.schemas import (
    LLMProfileCreate,
    LLMProfileExportFile,
    LLMProfileExportRequest,
    LLMProfileImportRequest,
    LLMProfileImportResult,
    LLMProfileResponse,
    LLMProfileUpdate,
)
from codebox_orchestrator.project.dependencies import (
    ProjectContext,
    get_project_context,
    require_project_admin,
)

if TYPE_CHECKING:
    from codebox_orchestrator.llm_profile.service import LLMProfileService
    from codebox_orchestrator.project_settings.service import ProjectSettingsService

router = APIRouter(prefix="/api/projects/{slug}", tags=["LLM Profiles"])


async def _default_profile_id(
    project_id: str,
    settings_service: ProjectSettingsService,
) -> str | None:
    settings = await settings_service.get_settings(project_id)
    return settings.default_llm_profile_id if settings else None


@router.get("/llm-profiles", summary="List LLM profiles", operation_id="list_llm_profiles")
async def list_profiles(
    ctx: ProjectContext = Depends(get_project_context),
    service: LLMProfileService = Depends(get_llm_profile_service),
    settings_service: ProjectSettingsService = Depends(get_project_settings_service),
) -> list[LLMProfileResponse]:
    default_id = await _default_profile_id(ctx.project_id, settings_service)
    views = await service.list_profiles(ctx.project_id, default_profile_id=default_id)
    return [LLMProfileResponse.model_validate(v.__dict__) for v in views]


@router.post(
    "/llm-profiles/export",
    summary="Export LLM profiles",
    operation_id="export_llm_profiles",
)
async def export_profiles(
    body: LLMProfileExportRequest,
    ctx: ProjectContext = Depends(require_project_admin),
    service: LLMProfileService = Depends(get_llm_profile_service),
) -> LLMProfileExportFile:
    if body.key_mode == "password_encrypted" and not body.password:
        raise HTTPException(400, "Password is required for password-encrypted export")
    try:
        data = await service.export_profiles(
            ctx.project_id,
            profile_ids=body.profile_ids,
            key_mode=body.key_mode,
            password=body.password,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return LLMProfileExportFile.model_validate(data)


@router.post(
    "/llm-profiles/import",
    status_code=201,
    summary="Import LLM profiles",
    operation_id="import_llm_profiles",
)
async def import_profiles(
    body: LLMProfileImportRequest,
    ctx: ProjectContext = Depends(require_project_admin),
    service: LLMProfileService = Depends(get_llm_profile_service),
) -> LLMProfileImportResult:
    if body.file.key_mode == "password_encrypted" and not body.password:
        raise HTTPException(400, "Password is required for password-encrypted import")
    try:
        created, skipped = await service.import_profiles(
            ctx.project_id,
            export_data=body.file.model_dump(),
            password=body.password,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(422, f"Import failed: {exc}") from exc
    return LLMProfileImportResult(
        imported=len(created),
        skipped=skipped,
        profiles=[LLMProfileResponse.model_validate(v.__dict__) for v in created],
    )


@router.post(
    "/llm-profiles",
    status_code=201,
    summary="Create LLM profile",
    operation_id="create_llm_profile",
)
async def create_profile(
    body: LLMProfileCreate,
    ctx: ProjectContext = Depends(require_project_admin),
    service: LLMProfileService = Depends(get_llm_profile_service),
) -> LLMProfileResponse:
    view = await service.create_profile(
        project_id=ctx.project_id,
        name=body.name,
        provider=body.provider,
        model=body.model,
        api_key=body.api_key,
        base_url=body.base_url,
    )
    return LLMProfileResponse.model_validate(view.__dict__)


@router.post(
    "/llm-profiles/{profile_id}/duplicate",
    status_code=201,
    summary="Duplicate LLM profile",
    operation_id="duplicate_llm_profile",
)
async def duplicate_profile(
    profile_id: str,
    ctx: ProjectContext = Depends(require_project_admin),
    service: LLMProfileService = Depends(get_llm_profile_service),
) -> LLMProfileResponse:
    view = await service.duplicate_profile(profile_id, ctx.project_id)
    if view is None:
        raise HTTPException(404, "Profile not found")
    return LLMProfileResponse.model_validate(view.__dict__)


@router.get(
    "/llm-profiles/{profile_id}",
    summary="Get LLM profile",
    operation_id="get_llm_profile",
)
async def get_profile(
    profile_id: str,
    ctx: ProjectContext = Depends(get_project_context),
    service: LLMProfileService = Depends(get_llm_profile_service),
    settings_service: ProjectSettingsService = Depends(get_project_settings_service),
) -> LLMProfileResponse:
    default_id = await _default_profile_id(ctx.project_id, settings_service)
    view = await service.get_profile(profile_id, ctx.project_id, default_profile_id=default_id)
    if view is None:
        raise HTTPException(404, "Profile not found")
    return LLMProfileResponse.model_validate(view.__dict__)


@router.patch(
    "/llm-profiles/{profile_id}",
    summary="Update LLM profile",
    operation_id="patch_llm_profile",
)
async def update_profile(
    profile_id: str,
    body: LLMProfileUpdate,
    ctx: ProjectContext = Depends(require_project_admin),
    service: LLMProfileService = Depends(get_llm_profile_service),
) -> LLMProfileResponse:
    view = await service.update_profile(
        profile_id,
        ctx.project_id,
        name=body.name,
        provider=body.provider,
        model=body.model,
        api_key=body.api_key,
        base_url=body.base_url,
    )
    if view is None:
        raise HTTPException(404, "Profile not found")
    return LLMProfileResponse.model_validate(view.__dict__)


@router.delete(
    "/llm-profiles/{profile_id}",
    status_code=204,
    summary="Delete LLM profile",
    operation_id="delete_llm_profile",
)
async def delete_profile(
    profile_id: str,
    ctx: ProjectContext = Depends(require_project_admin),
    service: LLMProfileService = Depends(get_llm_profile_service),
    settings_service: ProjectSettingsService = Depends(get_project_settings_service),
) -> None:
    deleted = await service.delete_profile(profile_id, ctx.project_id)
    if not deleted:
        raise HTTPException(404, "Profile not found")
    await settings_service.clear_default_if_matches(ctx.project_id, profile_id)
