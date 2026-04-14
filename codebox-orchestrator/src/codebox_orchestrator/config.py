"""Environment-based configuration for the orchestrator.

Only **server infrastructure** settings are loaded from environment variables.
All user-facing credentials (LLM API keys, Tavily, GitHub App config) are
stored per-user in the database — see ``llm_profile`` and ``user_settings``.
"""

from __future__ import annotations

import logging
import os
import tempfile as _tempfile
from pathlib import Path

from dotenv import load_dotenv

# Load .env from the project directory
_project_dir = Path(__file__).resolve().parent.parent.parent
load_dotenv(_project_dir / ".env")
load_dotenv(_project_dir / ".env.local", override=True)

# ── Database ────────────────────────────────────────────────────
DATABASE_URL: str = os.environ.get(
    "DATABASE_URL",
    "postgresql+asyncpg://codebox:codebox@localhost:5432/codebox",
)

# ── Container runtime ──────────────────────────────────────────
CODEBOX_IMAGE: str = os.environ.get("CODEBOX_IMAGE", "codebox-sandbox:latest")
DOCKER_NETWORK: str = os.environ.get("DOCKER_NETWORK", "codebox-net")
CONTAINER_RUNTIME_URL: str = os.environ.get("CONTAINER_RUNTIME_URL", "")
CONTAINER_RUNTIME_TYPE: str = os.environ.get("CONTAINER_RUNTIME_TYPE", "docker")
CONTAINER_TLS_VERIFY: str = os.environ.get("CONTAINER_TLS_VERIFY", "")
CONTAINER_TLS_CERT: str = os.environ.get("CONTAINER_TLS_CERT", "")
CONTAINER_TLS_KEY: str = os.environ.get("CONTAINER_TLS_KEY", "")

# ── Workspace ──────────────────────────────────────────────────
_default_workspace = str(Path(_tempfile.gettempdir()) / "codebox-workspaces")
WORKSPACE_BASE_DIR: str = os.environ.get("WORKSPACE_BASE_DIR", _default_workspace)
_workspace_dir_warning_emitted = False

# ── HTTP server ────────────────────────────────────────────────
HOST: str = os.environ.get("ORCHESTRATOR_HOST", "0.0.0.0")  # noqa: S104
PORT: int = int(os.environ.get("ORCHESTRATOR_PORT", "9090"))

# ── gRPC ───────────────────────────────────────────────────────
GRPC_PORT: int = int(os.environ.get("GRPC_PORT", "50051"))


def _default_grpc_address() -> str:
    import sys as _sys  # noqa: PLC0415

    if _sys.platform == "win32" and CONTAINER_RUNTIME_TYPE == "podman":
        host = "localhost"
    elif CONTAINER_RUNTIME_TYPE == "podman":
        host = "host.containers.internal"
    else:
        host = "host.docker.internal"
    return f"{host}:{GRPC_PORT}"


ORCHESTRATOR_GRPC_ADDRESS: str = (
    os.environ.get("ORCHESTRATOR_GRPC_ADDRESS", "") or _default_grpc_address()
)

# ── CORS ───────────────────────────────────────────────────────
CORS_ORIGINS: list[str] = [
    o.strip()
    for o in os.environ.get("CORS_ORIGINS", "http://localhost:3737").split(",")
    if o.strip()
]

# ── Encryption key for secrets in the database ─────────────────
ENCRYPTION_KEY: str = os.environ.get("ENCRYPTION_KEY", "")

# ── Callback JWT signing secret ────────────────────────────────
CALLBACK_SECRET: str = os.environ.get("CALLBACK_SECRET", "")

# ── Auth JWT signing secret ────────────────────────────────────
AUTH_SECRET: str = os.environ.get("AUTH_SECRET", "")
AUTH_TOKEN_EXPIRY_HOURS: int = int(os.environ.get("AUTH_TOKEN_EXPIRY_HOURS", "24"))

_fallback_secret: str = ""


def get_callback_secret() -> str:
    """Return the callback JWT signing secret, generating an ephemeral one if not configured."""
    global _fallback_secret  # noqa: PLW0603
    if CALLBACK_SECRET:
        return CALLBACK_SECRET
    if not _fallback_secret:
        import secrets as _secrets  # noqa: PLC0415

        _fallback_secret = _secrets.token_urlsafe(64)
        import logging as _logging  # noqa: PLC0415

        _logging.getLogger(__name__).warning(
            "CALLBACK_SECRET not set -- using ephemeral secret (tokens won't survive restart)"
        )
    return _fallback_secret


_fallback_auth_secret: str = ""


def get_auth_secret() -> str:
    """Return the auth JWT signing secret, generating an ephemeral one if not configured."""
    global _fallback_auth_secret  # noqa: PLW0603
    if AUTH_SECRET:
        return AUTH_SECRET
    if not _fallback_auth_secret:
        import secrets as _secrets  # noqa: PLC0415

        _fallback_auth_secret = _secrets.token_urlsafe(64)
        import logging as _logging  # noqa: PLC0415

        _logging.getLogger(__name__).warning(
            "AUTH_SECRET not set -- using ephemeral secret (sessions won't survive restart)"
        )
    return _fallback_auth_secret


def _workspace_fallback_dir() -> Path:
    """Return a user-scoped writable fallback workspace directory."""
    user_suffix = (
        str(os.getuid())
        if hasattr(os, "getuid")
        else os.environ.get("USERNAME") or os.environ.get("USER") or "local"
    )
    return Path(_tempfile.gettempdir()) / f"codebox-workspaces-{user_suffix}"


def get_workspace_base_dir() -> str:
    """Return a writable workspace base directory, falling back when needed."""
    global _workspace_dir_warning_emitted  # noqa: PLW0603

    configured_dir = Path(WORKSPACE_BASE_DIR)
    try:
        configured_dir.mkdir(parents=True, exist_ok=True)
        probe_dir = Path(_tempfile.mkdtemp(prefix=".workspace-probe-", dir=configured_dir))
        probe_dir.rmdir()
        return str(configured_dir)
    except OSError as exc:
        fallback_dir = _workspace_fallback_dir()
        fallback_dir.mkdir(parents=True, exist_ok=True)
        if not _workspace_dir_warning_emitted:
            logging.getLogger(__name__).warning(
                "WORKSPACE_BASE_DIR %s is not writable (%s); falling back to %s",
                configured_dir,
                exc,
                fallback_dir,
            )
            _workspace_dir_warning_emitted = True
        return str(fallback_dir)
