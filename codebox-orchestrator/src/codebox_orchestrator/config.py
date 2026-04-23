"""Typed configuration for the orchestrator.

All settings load from environment variables (and optionally ``.env``) via
``pydantic-settings``.  The ``CODEBOX_`` prefix is used for everything owned
by this project; well-known externals such as ``DATABASE_URL``,
``POSTGRES_*``, and ``GITHUB_TOKEN`` are read without a prefix.

Access settings via the module-level ``settings`` singleton::

    from codebox_orchestrator.config import settings

    print(settings.http.port)
    print(settings.box.image)
    print(settings.auth.secret.get_secret_value())

Only **server infrastructure** is loaded here.  User-facing credentials
(LLM API keys, Tavily, GitHub App config) live per-project in the database.
"""

from __future__ import annotations

import sys
from functools import lru_cache
from pathlib import Path
from typing import Annotated, Self

from pydantic import AliasChoices, Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_PROJECT_DIR = Path(__file__).resolve().parent.parent.parent
_ENV_FILE = str(_PROJECT_DIR / ".env")


def _default_public_host(container_runtime: str) -> str:
    """Host that a sandbox container uses to reach the orchestrator in local dev."""
    if sys.platform == "win32" and container_runtime == "podman":
        return "localhost"
    if container_runtime == "podman":
        return "host.containers.internal"
    return "host.docker.internal"


# ---------------------------------------------------------------------------
# Sub-settings (each loads env vars with its own prefix)
# ---------------------------------------------------------------------------


class HttpServerSettings(BaseSettings):
    """Orchestrator HTTP/REST server bind settings."""

    host: str = "0.0.0.0"  # noqa: S104
    port: int = 9090

    model_config = SettingsConfigDict(
        env_prefix="CODEBOX_ORCHESTRATOR_HTTP_",
        env_file=_ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",
    )


class GrpcServerSettings(BaseSettings):
    """gRPC server port and TLS settings."""

    port: int = Field(default=50051, validation_alias="CODEBOX_ORCHESTRATOR_GRPC_PORT")
    tls_enabled: bool = False
    tls_cert: str = ""
    tls_key: str = ""
    tls_ca_cert: str = ""

    model_config = SettingsConfigDict(
        env_prefix="CODEBOX_GRPC_",
        env_file=_ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",
    )


class OrchestratorUrlsSettings(BaseSettings):
    """Public URLs that sandbox containers use to reach the orchestrator.

    ``url`` is the HTTP base URL (``http://host:port`` or ``https://host``);
    the sandbox derives the WebSocket tunnel URL from it.

    ``grpc_url`` is the gRPC endpoint (``grpc://host:port`` or
    ``grpcs://host:port``).

    Both default to ``host.docker.internal`` / ``host.containers.internal`` so
    that local dev works without any override.  Defaults are computed in
    :meth:`Settings._fill_url_defaults` because they depend on the HTTP/gRPC
    port settings.

    ``public_url`` is the URL external callers (GitHub, browsers outside this
    host) use to reach the orchestrator. It is *not* auto-filled: when unset,
    flows that need a publicly reachable URL (e.g. the GitHub App manifest
    flow) will surface a clear error in the UI. Example production value:
    ``https://api.codebox.example.com``.

    ``ui_url`` is the publicly reachable base URL of the web UI (e.g.
    ``https://codebox.example.com``). Used to redirect the browser back to
    the project GitHub settings page after GitHub App manifest creation and
    installation. When unset, the orchestrator emits a relative redirect,
    which only works when the UI and API share a host (e.g. local dev).
    """

    url: str = ""
    grpc_url: str = ""
    public_url: str = ""
    ui_url: str = ""

    model_config = SettingsConfigDict(
        env_prefix="CODEBOX_ORCHESTRATOR_",
        env_file=_ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",
    )


class BoxRuntimeSettings(BaseSettings):
    """Resource limits and image for Box (sandbox) containers."""

    image: str = "codebox-sandbox:latest"
    network: str = "codebox-sandbox-net"
    memory_limit: str = "4g"
    cpu_limit: int = 2
    pids_limit: int = 1024
    # Grace period (seconds) used by the orphan-container scanner to avoid
    # racing with containers spawned moments before a scan.
    orphan_grace_seconds: int = 60

    model_config = SettingsConfigDict(
        env_prefix="CODEBOX_BOX_",
        env_file=_ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",
    )


class ContainerRuntimeSettings(BaseSettings):
    """Docker / Podman daemon connection settings."""

    runtime: str = "docker"  # "docker" | "podman"
    runtime_url: str = ""
    tls_verify: str = ""
    tls_cert: str = ""
    tls_key: str = ""

    model_config = SettingsConfigDict(
        env_prefix="CODEBOX_CONTAINER_",
        env_file=_ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",
    )


class AuthSettings(BaseSettings):
    """User-session auth (JWT)."""

    secret: SecretStr = SecretStr("")
    token_expiry_hours: int = 168

    model_config = SettingsConfigDict(
        env_prefix="CODEBOX_AUTH_",
        env_file=_ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",
    )


class CallbackSettings(BaseSettings):
    """Sandbox callback JWT settings (sandbox → orchestrator)."""

    secret: SecretStr = SecretStr("")
    token_expiry_seconds: int = 3600

    model_config = SettingsConfigDict(
        env_prefix="CODEBOX_CALLBACK_",
        env_file=_ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",
    )


class AdminBootstrapSettings(BaseSettings):
    """First-time admin bootstrap.

    Consulted only when the users table is empty.  After an admin exists,
    these values are ignored.
    """

    username: str = ""
    password: SecretStr = SecretStr("")

    model_config = SettingsConfigDict(
        env_prefix="CODEBOX_ADMIN_",
        env_file=_ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",
    )


# ---------------------------------------------------------------------------
# Top-level settings
# ---------------------------------------------------------------------------


class Settings(BaseSettings):
    """Complete orchestrator configuration."""

    environment: str = Field(default="development", validation_alias="CODEBOX_ENVIRONMENT")
    database_url: str = Field(
        default="postgresql+asyncpg://codebox:codebox@localhost:5432/codebox",
        validation_alias="DATABASE_URL",
    )
    cors_origins: Annotated[list[str], NoDecode] = Field(
        default=["http://localhost:3737"],
        validation_alias=AliasChoices("CODEBOX_CORS_ORIGINS"),
    )
    encryption_key: SecretStr = Field(
        default=SecretStr(""), validation_alias="CODEBOX_ENCRYPTION_KEY"
    )

    http: HttpServerSettings = Field(default_factory=HttpServerSettings)
    grpc: GrpcServerSettings = Field(default_factory=GrpcServerSettings)
    urls: OrchestratorUrlsSettings = Field(default_factory=OrchestratorUrlsSettings)
    box: BoxRuntimeSettings = Field(default_factory=BoxRuntimeSettings)
    container: ContainerRuntimeSettings = Field(default_factory=ContainerRuntimeSettings)
    auth: AuthSettings = Field(default_factory=AuthSettings)
    callback: CallbackSettings = Field(default_factory=CallbackSettings)
    admin: AdminBootstrapSettings = Field(default_factory=AdminBootstrapSettings)

    model_config = SettingsConfigDict(
        env_file=_ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # -- parsers -------------------------------------------------------------

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _parse_cors_origins(cls, value: object) -> object:
        """Accept a comma-separated string or a JSON list for ``CORS_ORIGINS``."""
        if isinstance(value, str):
            stripped = value.strip()
            if not stripped:
                return []
            # JSON-list form
            if stripped.startswith("["):
                return value
            # comma-separated form
            return [item.strip() for item in stripped.split(",") if item.strip()]
        return value

    # -- post-init validation ------------------------------------------------

    @model_validator(mode="after")
    def _fill_url_defaults(self) -> Self:
        """Compute local-dev defaults for orchestrator public URLs."""
        if not self.urls.url:
            host = _default_public_host(self.container.runtime)
            self.urls.url = f"http://{host}:{self.http.port}"
        if not self.urls.grpc_url:
            host = _default_public_host(self.container.runtime)
            self.urls.grpc_url = f"grpc://{host}:{self.grpc.port}"
        return self

    @model_validator(mode="after")
    def _require_secrets_in_production(self) -> Self:
        if self.environment == "development":
            return self
        missing: list[str] = []
        if not self.auth.secret.get_secret_value():
            missing.append("CODEBOX_AUTH_SECRET")
        if not self.callback.secret.get_secret_value():
            missing.append("CODEBOX_CALLBACK_SECRET")
        if not self.encryption_key.get_secret_value():
            missing.append("CODEBOX_ENCRYPTION_KEY")
        if missing:
            names = ", ".join(missing)
            msg = f"Required secrets are not set for non-development environment: {names}"
            raise ValueError(msg)
        return self

    # -- helpers -------------------------------------------------------------

    def auth_secret(self) -> str:
        """Return the auth JWT secret, falling back to a dev placeholder."""
        value = self.auth.secret.get_secret_value()
        if value:
            return value
        if self.environment == "development":
            return "dev-secret-change-me"
        msg = "CODEBOX_AUTH_SECRET must be set in non-development environments"
        raise RuntimeError(msg)

    def callback_secret(self) -> str:
        """Return the sandbox-callback JWT secret, falling back to a dev placeholder."""
        value = self.callback.secret.get_secret_value()
        if value:
            return value
        if self.environment == "development":
            return "dev-callback-secret-change-me"
        msg = "CODEBOX_CALLBACK_SECRET must be set in non-development environments"
        raise RuntimeError(msg)


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------


@lru_cache(maxsize=1)
def _load_settings() -> Settings:
    return Settings()


settings: Settings = _load_settings()
