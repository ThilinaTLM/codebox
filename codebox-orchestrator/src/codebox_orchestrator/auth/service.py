"""Authentication service -- password hashing, JWT tokens, and user CRUD."""

from __future__ import annotations

import hashlib
import hmac
import logging
import os
import secrets
import time
from typing import TYPE_CHECKING

import jwt
from sqlalchemy import func, select

from codebox_orchestrator.auth.models import User
from codebox_orchestrator.config import AUTH_TOKEN_EXPIRY_HOURS, get_auth_secret

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

logger = logging.getLogger(__name__)

_ALGORITHM = "HS256"
_PBKDF2_ITERATIONS = 600_000


# ---------------------------------------------------------------------------
# Password hashing
# ---------------------------------------------------------------------------


def hash_password(password: str) -> str:
    """Hash a password with PBKDF2-SHA256 and a random salt."""
    salt = os.urandom(32)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, _PBKDF2_ITERATIONS)
    return f"pbkdf2:sha256:{_PBKDF2_ITERATIONS}${salt.hex()}${dk.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    """Verify a password against a stored hash (constant-time comparison)."""
    try:
        _prefix, params = stored_hash.split(":", 2)[2].split("$", 1)
        iterations = int(_prefix)
        salt_hex, hash_hex = params.split("$", 1)
        salt = bytes.fromhex(salt_hex)
        expected = bytes.fromhex(hash_hex)
    except (ValueError, IndexError):
        return False
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, iterations)
    return hmac.compare_digest(dk, expected)


# ---------------------------------------------------------------------------
# JWT tokens
# ---------------------------------------------------------------------------


def create_auth_token(user: User) -> str:
    """Create a signed JWT auth token for a user."""
    now = int(time.time())
    payload = {
        "user_id": user.id,
        "username": user.username,
        "user_type": user.user_type,
        "iat": now,
        "exp": now + AUTH_TOKEN_EXPIRY_HOURS * 3600,
    }
    return jwt.encode(payload, get_auth_secret(), algorithm=_ALGORITHM)


def decode_auth_token(token: str) -> dict | None:
    """Decode and verify an auth JWT. Returns payload dict or None."""
    try:
        return jwt.decode(token, get_auth_secret(), algorithms=[_ALGORITHM])
    except jwt.PyJWTError:
        return None


# ---------------------------------------------------------------------------
# Auth service
# ---------------------------------------------------------------------------


class AuthService:
    """Handles user authentication and management."""

    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory

    async def ensure_default_admin(self) -> None:
        """Create a default admin user if no users exist. Logs credentials."""
        async with self._session_factory() as session:
            result = await session.execute(select(func.count(User.id)))
            count = result.scalar_one()
            if count > 0:
                return

            password = secrets.token_urlsafe(12)
            user = User(
                username="admin",
                password_hash=hash_password(password),
                user_type="admin",
            )
            session.add(user)
            await session.commit()

            banner = (
                "\n"
                "══════════════════════════════════════════════════\n"
                "  Default admin credentials (first-time setup):\n"
                f"  Username: admin\n"
                f"  Password: {password}\n"
                "══════════════════════════════════════════════════"
            )
            # Use print() to guarantee visibility regardless of logging config
            print(banner)  # noqa: T201

    async def authenticate(self, username: str, password: str) -> User | None:
        """Verify credentials. Returns the User or None."""
        async with self._session_factory() as session:
            result = await session.execute(select(User).where(User.username == username))
            user = result.scalar_one_or_none()
            if user is None or not verify_password(password, user.password_hash):
                return None
            return user

    async def change_password(self, user_id: str, old_password: str, new_password: str) -> bool:
        """Change a user's password. Returns False if old_password is wrong."""
        async with self._session_factory() as session:
            result = await session.execute(select(User).where(User.id == user_id))
            user = result.scalar_one_or_none()
            if user is None or not verify_password(old_password, user.password_hash):
                return False
            user.password_hash = hash_password(new_password)
            await session.commit()
            return True

    async def create_user(self, username: str, password: str, user_type: str) -> User:
        """Create a new user. Raises ValueError on duplicate username."""
        if user_type not in ("admin", "user"):
            msg = f"Invalid user_type: {user_type}"
            raise ValueError(msg)

        async with self._session_factory() as session:
            existing = await session.execute(select(User).where(User.username == username))
            if existing.scalar_one_or_none() is not None:
                msg = f"Username already exists: {username}"
                raise ValueError(msg)

            user = User(
                username=username,
                password_hash=hash_password(password),
                user_type=user_type,
            )
            session.add(user)
            await session.commit()
            await session.refresh(user)
            return user

    async def list_users(self) -> list[User]:
        """Return all users."""
        async with self._session_factory() as session:
            result = await session.execute(select(User).order_by(User.created_at))
            return list(result.scalars().all())

    async def delete_user(self, user_id: str, requesting_user_id: str) -> bool:
        """Delete a user. Prevents self-deletion. Returns False if not found."""
        if user_id == requesting_user_id:
            msg = "Cannot delete your own account"
            raise ValueError(msg)

        async with self._session_factory() as session:
            result = await session.execute(select(User).where(User.id == user_id))
            user = result.scalar_one_or_none()
            if user is None:
                return False
            await session.delete(user)
            await session.commit()
            return True
