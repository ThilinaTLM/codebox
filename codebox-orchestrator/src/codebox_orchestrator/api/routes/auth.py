"""Authentication API routes -- login, user management, password changes."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from codebox_orchestrator.api.dependencies import get_auth_service
from codebox_orchestrator.auth.dependencies import UserInfo, get_current_user, require_admin
from codebox_orchestrator.auth.service import create_auth_token

if TYPE_CHECKING:
    from codebox_orchestrator.auth.service import AuthService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])


# ── Schemas ──────────────────────────────────────────────────────


class LoginRequest(BaseModel):
    username: str
    password: str


class UserResponse(BaseModel):
    id: str
    username: str
    user_type: str
    created_at: str

    model_config = {"from_attributes": True}


class LoginResponse(BaseModel):
    token: str
    user: UserResponse


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str


class CreateUserRequest(BaseModel):
    username: str
    password: str
    user_type: str


# ── Public routes ────────────────────────────────────────────────


@router.post("/login")
async def login(
    body: LoginRequest,
    auth_service: AuthService = Depends(get_auth_service),
) -> LoginResponse:
    """Authenticate with username/password and receive a JWT token."""
    user = await auth_service.authenticate(body.username, body.password)
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    token = create_auth_token(user)
    return LoginResponse(
        token=token,
        user=UserResponse(
            id=user.id,
            username=user.username,
            user_type=user.user_type,
            created_at=user.created_at.isoformat(),
        ),
    )


# ── Authenticated routes ────────────────────────────────────────


@router.get("/me")
async def me(current_user: UserInfo = Depends(get_current_user)) -> UserResponse:
    """Return the current authenticated user's info."""
    return UserResponse(
        id=current_user.user_id,
        username=current_user.username,
        user_type=current_user.user_type,
        created_at="",  # Not stored in JWT; clients can ignore
    )


@router.post("/change-password", response_model=None)
async def change_password(
    body: ChangePasswordRequest,
    current_user: UserInfo = Depends(get_current_user),
    auth_service: AuthService = Depends(get_auth_service),
) -> dict[str, str]:
    """Change the current user's password."""
    if len(body.new_password) < 4:
        raise HTTPException(status_code=400, detail="Password must be at least 4 characters")
    success = await auth_service.change_password(
        current_user.user_id, body.old_password, body.new_password
    )
    if not success:
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    return {"status": "password_changed"}


# ── Admin routes ─────────────────────────────────────────────────


@router.get("/users")
async def list_users(
    _: UserInfo = Depends(require_admin),
    auth_service: AuthService = Depends(get_auth_service),
) -> list[UserResponse]:
    """List all users (admin only)."""
    users = await auth_service.list_users()
    return [
        UserResponse(
            id=u.id,
            username=u.username,
            user_type=u.user_type,
            created_at=u.created_at.isoformat(),
        )
        for u in users
    ]


@router.post("/users")
async def create_user(
    body: CreateUserRequest,
    _: UserInfo = Depends(require_admin),
    auth_service: AuthService = Depends(get_auth_service),
) -> UserResponse:
    """Create a new user (admin only)."""
    if len(body.password) < 4:
        raise HTTPException(status_code=400, detail="Password must be at least 4 characters")
    try:
        user = await auth_service.create_user(body.username, body.password, body.user_type)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return UserResponse(
        id=user.id,
        username=user.username,
        user_type=user.user_type,
        created_at=user.created_at.isoformat(),
    )


@router.delete("/users/{user_id}", response_model=None)
async def delete_user(
    user_id: str,
    current_user: UserInfo = Depends(require_admin),
    auth_service: AuthService = Depends(get_auth_service),
) -> dict[str, str]:
    """Delete a user (admin only). Cannot delete yourself."""
    try:
        deleted = await auth_service.delete_user(user_id, current_user.user_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not deleted:
        raise HTTPException(status_code=404, detail="User not found")
    return {"status": "deleted"}
