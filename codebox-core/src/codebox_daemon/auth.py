"""Bearer token authentication for the daemon API."""

from __future__ import annotations

import logging
import secrets
from pathlib import Path

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

logger = logging.getLogger(__name__)

_TOKEN_LENGTH = 32
_TOKEN_FILE_PRIMARY = Path("/run/daemon-token")
_TOKEN_FILE_FALLBACK = Path("/tmp/codebox-daemon-token")

# --- Generate and persist token on import ---

AUTH_TOKEN: str = secrets.token_urlsafe(_TOKEN_LENGTH)


def _write_token(token: str) -> Path:
    """Write the auth token to a file, returning the path used."""
    for path in (_TOKEN_FILE_PRIMARY, _TOKEN_FILE_FALLBACK):
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(token)
            path.chmod(0o600)
            logger.info("Auth token written to %s", path)
            return path
        except OSError:
            logger.debug("Cannot write token to %s, trying fallback", path)
    logger.warning("Could not write auth token to any path")
    return _TOKEN_FILE_FALLBACK


_token_path = _write_token(AUTH_TOKEN)


# --- Verification helpers ---


def verify_token(token: str) -> bool:
    """Check whether the supplied token matches the daemon token."""
    return secrets.compare_digest(token, AUTH_TOKEN)


def verify_ws_token(token: str) -> bool:
    """Verify a token from a WebSocket query parameter."""
    return verify_token(token)


# --- FastAPI dependency ---

_bearer_scheme = HTTPBearer()


async def require_auth(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer_scheme),
) -> None:
    """FastAPI dependency that enforces Bearer token authentication.

    Raises:
        HTTPException: 401 if the token is missing or invalid.
    """
    if not verify_token(credentials.credentials):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing auth token",
        )
