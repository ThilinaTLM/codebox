"""JWT-based callback token generation and validation."""

from __future__ import annotations

import time

import jwt

from codebox_orchestrator.config import settings

_ALGORITHM = "HS256"


def create_callback_token(box_id: str, entity_type: str = "box") -> str:
    """Create a signed JWT callback token for a sandbox container."""
    now = int(time.time())
    payload = {
        "box_id": box_id,
        "entity_type": entity_type,
        "iat": now,
        "exp": now + settings.callback.token_expiry_seconds,
    }
    return jwt.encode(payload, settings.callback_secret(), algorithm=_ALGORITHM)


def decode_callback_token(token: str) -> tuple[str, str] | None:
    """Decode and verify a callback JWT. Returns (box_id, entity_type) or None."""
    try:
        payload = jwt.decode(
            token,
            settings.callback_secret(),
            algorithms=[_ALGORITHM],
            leeway=30,
        )
    except jwt.PyJWTError:
        return None
    else:
        box_id = payload.get("box_id")
        entity_type = payload.get("entity_type")
        if box_id and entity_type:
            return (box_id, entity_type)
        return None
