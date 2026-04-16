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

router = APIRouter(prefix="/api/auth", tags=["Auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


class UserResponse(BaseModel):
    id: str
    username: str
    user_type: str
    status: str
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


def _user_response(user: User) -> UserResponse:
    return UserResponse(
        id=user.id,
        username=user.username,
        user_type=user.user_type,
        status=user.status.value if hasattr(user.status, "value") else str(user.status),
        first_name=user.first_name,
        last_name=user.last_name,
        created_at=user.created_at.isoformat(),
    )


def _set_auth_cookie(response: Response, token: str) -> None:
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


@router.post("/login", summary="Login", operation_id="login")
async def login(
    body: LoginRequest,
    response: Response,
    auth_service: AuthService = Depends(get_auth_service),
) -> LoginResponse:
    user = await auth_service.authenticate(body.username, body.password)
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    token = create_auth_token(user)
    _set_auth_cookie(response, token)
    return LoginResponse(user=_user_response(user))


@router.post("/logout", summary="Logout", operation_id="logout")
async def logout(response: Response) -> dict[str, bool]:
    response.delete_cookie(key="access_token", path="/")
    return {"ok": True}


@router.get("/me", summary="Get current user", operation_id="get_current_user")
async def me(
    current_user: UserInfo = Depends(get_current_user),
    auth_service: AuthService = Depends(get_auth_service),
) -> UserResponse:
    user = await auth_service.get_user_by_id(current_user.user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return _user_response(user)


@router.patch("/me", summary="Update current user", operation_id="update_current_user")
async def update_my_profile(
    body: UpdateProfileRequest,
    current_user: UserInfo = Depends(get_current_user),
    auth_service: AuthService = Depends(get_auth_service),
) -> UserResponse:
    user = await auth_service.update_profile(
        current_user.user_id,
        first_name=body.first_name,
        last_name=body.last_name,
    )
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return _user_response(user)


@router.post("/change-password", summary="Change password", operation_id="change_password")
async def change_password(
    body: ChangePasswordRequest,
    current_user: UserInfo = Depends(get_current_user),
    auth_service: AuthService = Depends(get_auth_service),
) -> dict[str, str]:
    if len(body.new_password) < 4:
        raise HTTPException(status_code=400, detail="Password must be at least 4 characters")
    success = await auth_service.change_password(
        current_user.user_id, body.old_password, body.new_password
    )
    if not success:
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    return {"status": "password_changed"}


@router.get("/users", summary="List users", operation_id="list_users")
async def list_users(
    _: UserInfo = Depends(require_admin),
    auth_service: AuthService = Depends(get_auth_service),
) -> list[UserResponse]:
    users = await auth_service.list_users(include_disabled=True, include_deleted=False)
    return [_user_response(u) for u in users]


@router.post("/users", status_code=201, summary="Create user", operation_id="create_user")
async def create_user(
    body: CreateUserRequest,
    _: UserInfo = Depends(require_admin),
    auth_service: AuthService = Depends(get_auth_service),
) -> UserResponse:
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


@router.post("/users/{user_id}/disable", summary="Disable user", operation_id="disable_user")
async def disable_user(
    user_id: str,
    current_user: UserInfo = Depends(require_admin),
    auth_service: AuthService = Depends(get_auth_service),
) -> dict[str, str]:
    try:
        disabled = await auth_service.disable_user(user_id, current_user.user_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not disabled:
        raise HTTPException(status_code=404, detail="User not found")
    return {"status": "disabled"}


@router.post("/users/{user_id}/enable", summary="Enable user", operation_id="enable_user")
async def enable_user(
    user_id: str,
    _: UserInfo = Depends(require_admin),
    auth_service: AuthService = Depends(get_auth_service),
) -> dict[str, str]:
    enabled = await auth_service.enable_user(user_id)
    if not enabled:
        raise HTTPException(status_code=404, detail="User not found")
    return {"status": "enabled"}


@router.delete("/users/{user_id}", summary="Delete user", operation_id="delete_user")
async def delete_user(
    user_id: str,
    current_user: UserInfo = Depends(require_admin),
    auth_service: AuthService = Depends(get_auth_service),
) -> dict[str, str]:
    try:
        deleted = await auth_service.delete_user(user_id, current_user.user_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not deleted:
        raise HTTPException(status_code=404, detail="User not found")
    return {"status": "deleted"}
