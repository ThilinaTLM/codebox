"""API route for listing available OpenRouter models."""

from __future__ import annotations

import logging
import time

import httpx
from fastapi import APIRouter, HTTPException

from codebox_orchestrator.api.schemas import ModelResponse
from codebox_orchestrator.config import OPENROUTER_API_KEY

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")

_CACHE_TTL = 300  # 5 minutes
_cache: list[ModelResponse] = []
_cache_ts: float = 0


@router.get("/models")
async def list_models() -> list[ModelResponse]:
    """Return available OpenRouter models (cached for 5 minutes)."""
    global _cache, _cache_ts  # noqa: PLW0603

    now = time.monotonic()
    if _cache and (now - _cache_ts) < _CACHE_TTL:
        return _cache

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
        if _cache:
            return _cache
        raise HTTPException(502, "Failed to fetch models from OpenRouter") from exc

    data = resp.json().get("data", [])
    models = sorted(
        [ModelResponse(id=m["id"], name=m.get("name", m["id"])) for m in data],
        key=lambda m: m.name,
    )

    _cache = models
    _cache_ts = now
    return models
