"""Environment-based configuration for the orchestrator.

Only **server infrastructure** settings are loaded from environment variables.
All user-facing credentials (LLM API keys, Tavily, GitHub App config) are
stored per-project in the database — see ``llm_profile`` and ``project_settings``.
"""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

# Load .env from the project directory
_project_dir = Path(__file__).resolve().parent.parent.parent
load_dotenv(_project_dir / ".env")
load_dotenv(_project_dir / ".env.local", override=True)

# ── Environment ─────────────────────────────────────────────────
ENVIRONMENT: str = os.environ.get("ENVIRONMENT", "development")

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

# ── Sandbox resource limits ─────────────────────────────────────
SANDBOX_MEMORY_LIMIT: str = os.environ.get("SANDBOX_MEMORY_LIMIT", "4g")
SANDBOX_CPU_LIMIT: int = int(os.environ.get("SANDBOX_CPU_LIMIT", "2"))
SANDBOX_PIDS_LIMIT: int = int(os.environ.get("SANDBOX_PIDS_LIMIT", "1024"))
SANDBOX_NETWORK: str = os.environ.get("SANDBOX_NETWORK", "codebox-sandbox-net")

# ── HTTP server ────────────────────────────────────────────────
HOST: str = os.environ.get("ORCHESTRATOR_HOST", "0.0.0.0")  # noqa: S104
PORT: int = int(os.environ.get("ORCHESTRATOR_PORT", "9090"))

# ── gRPC ───────────────────────────────────────────────────────
GRPC_PORT: int = int(os.environ.get("GRPC_PORT", "50051"))
GRPC_TLS_CERT: str = os.environ.get("GRPC_TLS_CERT", "")  # Path to server cert PEM
GRPC_TLS_KEY: str = os.environ.get("GRPC_TLS_KEY", "")  # Path to server key PEM
GRPC_TLS_CA_CERT: str = os.environ.get("GRPC_TLS_CA_CERT", "")  # Path to CA cert PEM


def _default_public_host() -> str:
    import sys as _sys  # noqa: PLC0415

    if _sys.platform == "win32" and CONTAINER_RUNTIME_TYPE == "podman":
        return "localhost"
    if CONTAINER_RUNTIME_TYPE == "podman":
        return "host.containers.internal"
    return "host.docker.internal"


ORCHESTRATOR_WS_PUBLIC_URL: str = os.environ.get(
    "ORCHESTRATOR_WS_PUBLIC_URL",
    f"ws://{_default_public_host()}:{PORT}",
)
ORCHESTRATOR_GRPC_PUBLIC_URL: str = os.environ.get(
    "ORCHESTRATOR_GRPC_PUBLIC_URL",
    f"grpc://{_default_public_host()}:{GRPC_PORT}",
)

# ── Auth / sessions ────────────────────────────────────────────
AUTH_SECRET: str = os.environ.get("AUTH_SECRET", "")
AUTH_TOKEN_EXPIRY_HOURS: int = int(os.environ.get("AUTH_TOKEN_EXPIRY_HOURS", "168"))
CALLBACK_SECRET: str = os.environ.get("CALLBACK_SECRET", "")
CALLBACK_TOKEN_EXPIRY_SECONDS: int = int(os.environ.get("CALLBACK_TOKEN_EXPIRY_SECONDS", "3600"))

# ── Initial admin (first-time bootstrap only) ─────────────────
# Consulted only when the users table is empty. Once any user exists,
# these values are ignored and the admin manages their password from the
# account page (POST /api/auth/change-password).
INITIAL_ADMIN_USERNAME: str = os.environ.get("CODEBOX_ADMIN_USERNAME", "").strip()
INITIAL_ADMIN_PASSWORD: str = os.environ.get("CODEBOX_ADMIN_PASSWORD", "")

# ── CORS ───────────────────────────────────────────────────────
CORS_ORIGINS: list[str] = [
    origin.strip()
    for origin in os.environ.get("CORS_ORIGINS", "http://localhost:3737").split(",")
    if origin.strip()
]


def get_auth_secret() -> str:
    if AUTH_SECRET:
        return AUTH_SECRET
    if ENVIRONMENT == "development":
        return "dev-secret-change-me"
    raise RuntimeError("AUTH_SECRET must be set in non-development environments")


def get_callback_secret() -> str:
    if CALLBACK_SECRET:
        return CALLBACK_SECRET
    if ENVIRONMENT == "development":
        return "dev-callback-secret-change-me"
    raise RuntimeError("CALLBACK_SECRET must be set in non-development environments")


def validate_required_config() -> None:
    if ENVIRONMENT != "development" and not AUTH_SECRET:
        raise RuntimeError("AUTH_SECRET is required in production")
    if ENVIRONMENT != "development" and not CALLBACK_SECRET:
        raise RuntimeError("CALLBACK_SECRET is required in production")
