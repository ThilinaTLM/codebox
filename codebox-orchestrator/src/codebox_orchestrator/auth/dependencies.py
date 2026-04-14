"""FastAPI authentication dependencies."""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import Depends, HTTPException, Request

from codebox_orchestrator.auth.service import decode_auth_token


@dataclass
class UserInfo:
    """Lightweight user identity extracted from a validated JWT."""

    user_id: str
    username: str
    user_type: str  # "admin" | "user"


async def get_current_user(request: Request) -> UserInfo:
    """Extract and validate auth token from cookie or Authorization header.

    Checks the ``access_token`` HttpOnly cookie first, then falls back to the
    ``Authorization: Bearer <token>`` header (for API clients / backward compat).

    Raises HTTPException(401) on missing or invalid token.
    """
    # 1. Try HttpOnly cookie first
    token = request.cookies.get("access_token")

    # 2. Fall back to Authorization header (API clients, backward compat)
    if not token:
        auth = request.headers.get("authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]

    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    payload = decode_auth_token(token)
    if payload is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return UserInfo(
        user_id=payload["user_id"],
        username=payload["username"],
        user_type=payload["user_type"],
    )


async def require_admin(user: UserInfo = Depends(get_current_user)) -> UserInfo:
    """Raises HTTPException(403) if the current user is not an admin."""
    if user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user
