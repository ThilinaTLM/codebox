"""Environment-based configuration for the orchestrator."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

# Load .env from the project directory
_project_dir = Path(__file__).resolve().parent.parent.parent
load_dotenv(_project_dir / ".env")
load_dotenv(_project_dir / ".env.local", override=True)

_default_db = f"sqlite+aiosqlite:///{_project_dir / 'data' / 'orchestrator.db'}"
DATABASE_URL: str = os.environ.get("DATABASE_URL", _default_db)
CODEBOX_IMAGE: str = os.environ.get("CODEBOX_IMAGE", "codebox-sandbox:latest")
OPENROUTER_API_KEY: str = os.environ.get("OPENROUTER_API_KEY", "")
OPENROUTER_MODEL: str = os.environ.get("OPENROUTER_MODEL", "")
TAVILY_API_KEY: str = os.environ.get("TAVILY_API_KEY", "")
WORKSPACE_BASE_DIR: str = os.environ.get("WORKSPACE_BASE_DIR", "/tmp/codebox-workspaces")
DOCKER_NETWORK: str = os.environ.get("DOCKER_NETWORK", "codebox-net")

# Container runtime configuration
CONTAINER_RUNTIME_URL: str = os.environ.get("CONTAINER_RUNTIME_URL", "")
CONTAINER_RUNTIME_TYPE: str = os.environ.get("CONTAINER_RUNTIME_TYPE", "docker")
CONTAINER_TLS_VERIFY: str = os.environ.get("CONTAINER_TLS_VERIFY", "")
CONTAINER_TLS_CERT: str = os.environ.get("CONTAINER_TLS_CERT", "")
CONTAINER_TLS_KEY: str = os.environ.get("CONTAINER_TLS_KEY", "")

ORCHESTRATOR_CALLBACK_URL: str = os.environ.get("ORCHESTRATOR_CALLBACK_URL", "")
HOST: str = os.environ.get("ORCHESTRATOR_HOST", "0.0.0.0")
PORT: int = int(os.environ.get("ORCHESTRATOR_PORT", "8080"))
CORS_ORIGINS: list[str] = [
    o.strip()
    for o in os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(",")
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

_fallback_secret: str = ""


def get_callback_secret() -> str:
    """Return the callback JWT signing secret, generating an ephemeral one if not configured."""
    global _fallback_secret
    if CALLBACK_SECRET:
        return CALLBACK_SECRET
    if not _fallback_secret:
        import secrets as _secrets
        _fallback_secret = _secrets.token_urlsafe(64)
        import logging as _logging
        _logging.getLogger(__name__).warning(
            "CALLBACK_SECRET not set -- using ephemeral secret (tokens won't survive restart)"
        )
    return _fallback_secret


def github_enabled() -> bool:
    """Return True if GitHub App credentials are configured."""
    return bool(GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY_PATH)
