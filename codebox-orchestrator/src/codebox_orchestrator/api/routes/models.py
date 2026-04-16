"""API route for listing available models by provider (project-scoped)."""

from __future__ import annotations

import logging
import time
from typing import TYPE_CHECKING

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query

from codebox_orchestrator.api.dependencies import (
    get_llm_profile_service,
    get_project_settings_service,
)
from codebox_orchestrator.api.schemas import ModelResponse, ModelsPreviewRequest
from codebox_orchestrator.project.dependencies import (
    ProjectContext,
    get_project_context,
)

if TYPE_CHECKING:
    from codebox_orchestrator.llm_profile.service import LLMProfileService
    from codebox_orchestrator.project_settings.service import ProjectSettingsService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/projects/{slug}")

_CACHE_TTL = 300  # 5 minutes
_cache: dict[str, list[ModelResponse]] = {}
_cache_ts: dict[str, float] = {}


async def _resolve_profile_key(
    project_id: str,
    profile_id: str | None,
    profile_service: LLMProfileService,
    settings_service: ProjectSettingsService,
) -> tuple[str, str, str | None]:
    """Resolve (provider, api_key, base_url) from profile or default."""
    pid = profile_id
    if not pid:
        pid = await settings_service.get_default_profile_id(project_id)
    if not pid:
        raise HTTPException(400, "No profile specified and no default profile configured")

    resolved = await profile_service.resolve_profile(pid, project_id)
    if resolved is None:
        raise HTTPException(400, "LLM profile not found or does not belong to this project")
    return resolved.provider, resolved.api_key, resolved.base_url


@router.get("/models")
async def list_models(
    ctx: ProjectContext = Depends(get_project_context),
    profile_id: str | None = Query(default=None),
    profile_service: LLMProfileService = Depends(get_llm_profile_service),
    settings_service: ProjectSettingsService = Depends(get_project_settings_service),
) -> list[ModelResponse]:
    """Return available models for the selected profile's provider (cached 5 min)."""
    provider, api_key, base_url = await _resolve_profile_key(
        ctx.project_id, profile_id, profile_service, settings_service
    )

    # Cache key includes project to avoid cross-project cache hits
    cache_key = f"{ctx.project_id}:{provider}"
    now = time.monotonic()
    if cache_key in _cache and (now - _cache_ts.get(cache_key, 0)) < _CACHE_TTL:
        return _cache[cache_key]

    if provider == "openrouter":
        models = await _fetch_openrouter_models(api_key)
    elif provider == "openai":
        models = await _fetch_openai_models(api_key, base_url)
    else:
        raise HTTPException(400, f"Unsupported provider: {provider}")

    _cache[cache_key] = models
    _cache_ts[cache_key] = now
    return models


@router.post("/models/preview")
async def preview_models(
    body: ModelsPreviewRequest,
    ctx: ProjectContext = Depends(get_project_context),
) -> list[ModelResponse]:
    """Fetch models using raw credentials (no saved profile needed)."""
    provider = body.provider
    api_key = body.api_key
    base_url = body.base_url

    cache_key = f"{ctx.project_id}:{provider}:preview"
    now = time.monotonic()
    if cache_key in _cache and (now - _cache_ts.get(cache_key, 0)) < _CACHE_TTL:
        return _cache[cache_key]

    if provider == "openrouter":
        models = await _fetch_openrouter_models(api_key)
    elif provider in ("openai", "openai-compatible"):
        models = await _fetch_openai_models(api_key, base_url)
    else:
        raise HTTPException(400, f"Unsupported provider: {provider}")

    _cache[cache_key] = models
    _cache_ts[cache_key] = now
    return models


async def _fetch_openrouter_models(api_key: str) -> list[ModelResponse]:
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                "https://openrouter.ai/api/v1/models",
                headers={"Authorization": f"Bearer {api_key}"},
                timeout=15.0,
            )
            resp.raise_for_status()
    except httpx.HTTPError as exc:
        logger.warning("Failed to fetch OpenRouter models: %s", exc)
        raise HTTPException(502, "Failed to fetch models from OpenRouter") from exc

    data = resp.json().get("data", [])
    return sorted(
        [
            ModelResponse(
                provider="openrouter",
                id=m["id"],
                name=m.get("name", m["id"]),
            )
            for m in data
        ],
        key=lambda m: m.name,
    )


async def _fetch_openai_models(api_key: str, base_url: str | None) -> list[ModelResponse]:
    resolved_base = base_url.rstrip("/") if base_url else "https://api.openai.com/v1"
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{resolved_base}/models",
                headers={"Authorization": f"Bearer {api_key}"},
                timeout=15.0,
            )
            resp.raise_for_status()
    except httpx.HTTPError as exc:
        logger.warning("Failed to fetch OpenAI models: %s", exc)
        raise HTTPException(502, "Failed to fetch models from OpenAI") from exc

    data = resp.json().get("data", [])
    return sorted(
        [ModelResponse(provider="openai", id=m["id"], name=m.get("id", m["id"])) for m in data],
        key=lambda m: m.name,
    )
