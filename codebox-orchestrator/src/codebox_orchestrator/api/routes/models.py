"""API route for listing available models by provider."""

from __future__ import annotations

import logging
import time

import httpx
from fastapi import APIRouter, HTTPException, Query

from codebox_orchestrator.api.schemas import ModelResponse
from codebox_orchestrator.config import (
    LLM_PROVIDER,
    OPENAI_API_KEY,
    OPENAI_BASE_URL,
    OPENROUTER_API_KEY,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")

_CACHE_TTL = 300  # 5 minutes
_cache: dict[str, list[ModelResponse]] = {}
_cache_ts: dict[str, float] = {}


@router.get("/models")
async def list_models(provider: str = Query(default=LLM_PROVIDER)) -> list[ModelResponse]:
    """Return available models for the selected provider (cached for 5 minutes)."""

    now = time.monotonic()
    if provider in _cache and (now - _cache_ts.get(provider, 0)) < _CACHE_TTL:
        return _cache[provider]

    if provider == "openrouter":
        models = await _fetch_openrouter_models()
    elif provider == "openai":
        models = await _fetch_openai_models()
    else:
        raise HTTPException(400, f"Unsupported provider: {provider}")

    _cache[provider] = models
    _cache_ts[provider] = now
    return models


async def _fetch_openrouter_models() -> list[ModelResponse]:
    if not OPENROUTER_API_KEY:
        raise HTTPException(500, "OPENROUTER_API_KEY not configured")

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                "https://openrouter.ai/api/v1/models",
                headers={"Authorization": f"Bearer {OPENROUTER_API_KEY}"},
                timeout=15.0,
            )
            resp.raise_for_status()
    except httpx.HTTPError as exc:
        logger.warning("Failed to fetch OpenRouter models: %s", exc)
        if "openrouter" in _cache:
            return _cache["openrouter"]
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


async def _fetch_openai_models() -> list[ModelResponse]:
    if not OPENAI_API_KEY:
        raise HTTPException(500, "OPENAI_API_KEY not configured")

    base_url = OPENAI_BASE_URL.rstrip("/") if OPENAI_BASE_URL else "https://api.openai.com/v1"
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{base_url}/models",
                headers={"Authorization": f"Bearer {OPENAI_API_KEY}"},
                timeout=15.0,
            )
            resp.raise_for_status()
    except httpx.HTTPError as exc:
        logger.warning("Failed to fetch OpenAI models: %s", exc)
        if "openai" in _cache:
            return _cache["openai"]
        raise HTTPException(502, "Failed to fetch models from OpenAI") from exc

    data = resp.json().get("data", [])
    return sorted(
        [ModelResponse(provider="openai", id=m["id"], name=m.get("id", m["id"])) for m in data],
        key=lambda m: m.name,
    )
