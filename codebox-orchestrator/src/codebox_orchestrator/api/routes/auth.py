"""Authentication API routes -- login, user management, password changes."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel

from codebox_orchestrator.api.dependencies import get_auth_service
from codebox_orchestrator.auth.dependencies import UserInfo, get_current_user, require_admin
from codebox_orchestrator.auth.service import create_auth_token
from codebox_orchestrator.config import AUTH_TOKEN_EXPIRY_HOURS, ENVIRONMENT

if TYPE_CHECKING:
    from codebox_orchestrator.auth.models import User
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
    first_name: str | None = None
    last_name: str | None = None
    created_at: str

    model_config = {"from_attributes": True}


class LoginResponse(BaseModel):
    user: UserResponse


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str


class CreateUserRequest(BaseModel):
    username: str
    password: str
    user_type: str
    first_name: str | None = None
    last_name: str | None = None


class UpdateProfileRequest(BaseModel):
    first_name: str | None = None
    last_name: str | None = None


# ── Public routes ────────────────────────────────────────────────


def _user_response(user: User) -> UserResponse:
    """Build a UserResponse from a User ORM instance."""
    return UserResponse(
        id=user.id,
        username=user.username,
        user_type=user.user_type,
        first_name=user.first_name,
        last_name=user.last_name,
        created_at=user.created_at.isoformat(),
    )


def _set_auth_cookie(response: Response, token: str) -> None:
    """Set the HttpOnly auth cookie on a response."""
    secure = ENVIRONMENT != "development"
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=secure,
        samesite="lax",
        path="/",
        max_age=int(AUTH_TOKEN_EXPIRY_HOURS * 3600),
    )


@router.post("/login")
async def login(
    body: LoginRequest,
    response: Response,
    auth_service: AuthService = Depends(get_auth_service),
) -> LoginResponse:
    """Authenticate with username/password and set an HttpOnly auth cookie."""
    user = await auth_service.authenticate(body.username, body.password)
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    token = create_auth_token(user)
    _set_auth_cookie(response, token)
    return LoginResponse(user=_user_response(user))


@router.post("/logout")
async def logout(response: Response) -> dict[str, bool]:
    """Clear the auth cookie."""
    response.delete_cookie(key="access_token", path="/")
    return {"ok": True}


# ── Authenticated routes ────────────────────────────────────────


@router.get("/me")
async def me(
    current_user: UserInfo = Depends(get_current_user),
    auth_service: AuthService = Depends(get_auth_service),
) -> UserResponse:
    """Return the current authenticated user's info (fetched from DB)."""
    user = await auth_service.get_user_by_id(current_user.user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return _user_response(user)


@router.patch("/me")
async def update_my_profile(
    body: UpdateProfileRequest,
    current_user: UserInfo = Depends(get_current_user),
    auth_service: AuthService = Depends(get_auth_service),
) -> UserResponse:
    """Update the current user's profile (first/last name)."""
    user = await auth_service.update_profile(
        current_user.user_id,
        first_name=body.first_name,
        last_name=body.last_name,
    )
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return _user_response(user)


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
    return [_user_response(u) for u in users]


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
        user = await auth_service.create_user(
            body.username,
            body.password,
            body.user_type,
            first_name=body.first_name,
            last_name=body.last_name,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _user_response(user)


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
