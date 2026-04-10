"""Environment-based configuration for the orchestrator."""

from __future__ import annotations

import os
import tempfile as _tempfile
from pathlib import Path

from dotenv import load_dotenv

# Load .env from the project directory
_project_dir = Path(__file__).resolve().parent.parent.parent
load_dotenv(_project_dir / ".env")
load_dotenv(_project_dir / ".env.local", override=True)

_default_db = f"sqlite+aiosqlite:///{_project_dir / 'data' / 'orchestrator.db'}"
DATABASE_URL: str = os.environ.get("DATABASE_URL", _default_db)
CODEBOX_IMAGE: str = os.environ.get("CODEBOX_IMAGE", "codebox-sandbox:latest")
LLM_PROVIDER: str = os.environ.get("LLM_PROVIDER", "") or (
    "openrouter"
    if os.environ.get("OPENROUTER_MODEL", "")
    else "openai"
    if os.environ.get("OPENAI_API_KEY", "")
    else "openrouter"
)
LLM_MODEL: str = (
    os.environ.get("OPENROUTER_MODEL", "")
    if LLM_PROVIDER == "openrouter"
    else os.environ.get("OPENAI_MODEL", "")
)
LLM_API_KEY: str = (
    os.environ.get("OPENROUTER_API_KEY", "")
    if LLM_PROVIDER == "openrouter"
    else os.environ.get("OPENAI_API_KEY", "")
)
LLM_BASE_URL: str = os.environ.get("OPENAI_BASE_URL", "") if LLM_PROVIDER == "openai" else ""
OPENROUTER_API_KEY: str = os.environ.get("OPENROUTER_API_KEY", "")
OPENROUTER_MODEL: str = os.environ.get("OPENROUTER_MODEL", "")
OPENAI_API_KEY: str = os.environ.get("OPENAI_API_KEY", "")
OPENAI_MODEL: str = os.environ.get("OPENAI_MODEL", "")
OPENAI_BASE_URL: str = os.environ.get("OPENAI_BASE_URL", "")
TAVILY_API_KEY: str = os.environ.get("TAVILY_API_KEY", "")
_default_workspace = str(Path(_tempfile.gettempdir()) / "codebox-workspaces")
WORKSPACE_BASE_DIR: str = os.environ.get("WORKSPACE_BASE_DIR", _default_workspace)
DOCKER_NETWORK: str = os.environ.get("DOCKER_NETWORK", "codebox-net")

# Container runtime configuration
CONTAINER_RUNTIME_URL: str = os.environ.get("CONTAINER_RUNTIME_URL", "")
CONTAINER_RUNTIME_TYPE: str = os.environ.get("CONTAINER_RUNTIME_TYPE", "docker")
CONTAINER_TLS_VERIFY: str = os.environ.get("CONTAINER_TLS_VERIFY", "")
CONTAINER_TLS_CERT: str = os.environ.get("CONTAINER_TLS_CERT", "")
CONTAINER_TLS_KEY: str = os.environ.get("CONTAINER_TLS_KEY", "")

HOST: str = os.environ.get("ORCHESTRATOR_HOST", "0.0.0.0")  # noqa: S104
PORT: int = int(os.environ.get("ORCHESTRATOR_PORT", "9090"))


# gRPC port for sandbox connections
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
CORS_ORIGINS: list[str] = [
    o.strip()
    for o in os.environ.get("CORS_ORIGINS", "http://localhost:3737").split(",")
    if o.strip()
]

# GitHub App configuration (all optional — integration disabled if not set)
GITHUB_APP_ID: str = os.environ.get("GITHUB_APP_ID", "")
GITHUB_APP_PRIVATE_KEY_PATH: str = os.environ.get("GITHUB_APP_PRIVATE_KEY_PATH", "")
GITHUB_WEBHOOK_SECRET: str = os.environ.get("GITHUB_WEBHOOK_SECRET", "")
GITHUB_APP_SLUG: str = os.environ.get("GITHUB_APP_SLUG", "codebox")
GITHUB_BOT_NAME: str = os.environ.get("GITHUB_BOT_NAME", "") or GITHUB_APP_SLUG
GITHUB_DEFAULT_BASE_BRANCH: str = os.environ.get("GITHUB_DEFAULT_BASE_BRANCH", "main")

# Callback JWT signing secret
CALLBACK_SECRET: str = os.environ.get("CALLBACK_SECRET", "")

# Auth JWT signing secret (separate from callback to avoid token confusion)
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


def github_enabled() -> bool:
    """Return True if GitHub App credentials are configured."""
    return bool(GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY_PATH)
