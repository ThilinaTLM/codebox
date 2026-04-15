"""Environment-based configuration for the orchestrator.

Only **server infrastructure** settings are loaded from environment variables.
All user-facing credentials (LLM API keys, Tavily, GitHub App config) are
stored per-user in the database — see ``llm_profile`` and ``user_settings``.
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

# ── Callback token expiry ──────────────────────────────────────
CALLBACK_TOKEN_EXPIRY_SECONDS: int = int(os.environ.get("CALLBACK_TOKEN_EXPIRY_SECONDS", "86400"))


def get_callback_secret() -> str:
    """Return the callback JWT signing secret. Raises if not configured."""
    if not CALLBACK_SECRET:
        raise RuntimeError(
            "CALLBACK_SECRET environment variable is required. "
            'Generate one with: python -c "import secrets; print(secrets.token_urlsafe(64))"'
        )
    return CALLBACK_SECRET


def get_auth_secret() -> str:
    """Return the auth JWT signing secret. Raises if not configured."""
    if not AUTH_SECRET:
        raise RuntimeError(
            "AUTH_SECRET environment variable is required. "
            'Generate one with: python -c "import secrets; print(secrets.token_urlsafe(64))"'
        )
    return AUTH_SECRET


def validate_required_config() -> None:
    """Validate that all required secrets are configured. Call at startup."""
    missing: list[str] = []
    if not AUTH_SECRET:
        missing.append("AUTH_SECRET")
    if not CALLBACK_SECRET:
        missing.append("CALLBACK_SECRET")
    if not os.environ.get("ENCRYPTION_KEY", ""):
        missing.append("ENCRYPTION_KEY")
    if missing:
        raise RuntimeError(
            f"Required environment variables not set: {', '.join(missing)}. "
            "See codebox-orchestrator/README.md for setup instructions."
        )
