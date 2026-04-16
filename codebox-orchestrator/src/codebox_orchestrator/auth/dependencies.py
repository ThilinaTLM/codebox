"""FastAPI authentication dependencies."""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import Depends, HTTPException, Request

from codebox_orchestrator.auth.models import UserStatus
from codebox_orchestrator.auth.service import decode_auth_token


@dataclass
class UserInfo:
    """Lightweight user identity extracted from a validated JWT."""

    user_id: str
    username: str
    user_type: str  # "admin" | "user"


async def get_current_user(request: Request) -> UserInfo:
    """Extract and validate auth token from cookie or Authorization header."""
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]

    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    payload = decode_auth_token(token)
    if payload is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    auth_service = request.app.state.auth_service
    user = await auth_service.get_user_by_id(
        payload["user_id"], include_disabled=False, include_deleted=False
    )
    if user is None or user.status != UserStatus.ACTIVE:
        raise HTTPException(status_code=401, detail="User account is not active")

    return UserInfo(
        user_id=user.id,
        username=user.username,
        user_type=user.user_type,
    )


async def require_admin(user: UserInfo = Depends(get_current_user)) -> UserInfo:
    """Raises HTTPException(403) if the current user is not an admin."""
    if user.user_type != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user
