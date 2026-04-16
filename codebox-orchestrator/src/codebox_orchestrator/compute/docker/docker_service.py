"""Container runtime lifecycle management for sandbox containers.

Supports Docker and Podman via configurable connection backends:
local sockets, remote TCP/TLS, and SSH.
"""

from __future__ import annotations

import logging
import sys
from dataclasses import dataclass
from typing import Any

import docker
import docker.errors
import docker.tls

from codebox_orchestrator.config import settings

logger = logging.getLogger(__name__)

CONTAINER_LABEL = "codebox-sandbox"

_client: docker.DockerClient | None = None


class DockerServiceError(Exception):
    """Raised when a container runtime operation fails."""


@dataclass
class ContainerInfo:
    id: str
    name: str
    status: str = ""
    provider: str = ""
    model: str = ""
    image: str = ""
    started_at: str | None = None
    created_at: str | None = None
    # Label-based metadata
    box_id: str = ""
    box_name: str = ""
    project_id: str = ""
    trigger: str = ""
    description: str = ""
    tags: list[str] | None = None
    github_repo: str = ""
    github_branch: str = ""
    github_issue_number: int | None = None


def _get_client() -> docker.DockerClient:
    global _client  # noqa: PLW0603
    if _client is not None:
        return _client
    container = settings.container
    try:
        if not container.runtime_url:
            _client = docker.from_env()
        else:
            kwargs: dict[str, Any] = {"base_url": container.runtime_url}
            if container.tls_cert and container.tls_key:
                tls_verify = container.tls_verify
                tls_config = docker.tls.TLSConfig(
                    client_cert=(container.tls_cert, container.tls_key),
                    ca_cert=tls_verify if tls_verify not in ("", "true", "false") else None,
                    verify=tls_verify != "false",
                )
                kwargs["tls"] = tls_config
            _client = docker.DockerClient(**kwargs)
    except docker.errors.DockerException as exc:
        raise DockerServiceError(f"Cannot connect to container runtime: {exc}") from exc
    else:
        return _client


def reset_client() -> None:
    """Clear the cached client (useful for testing)."""
    global _client  # noqa: PLW0603
    _client = None


def check_connection() -> dict[str, str]:
    """Verify the container runtime is reachable and return version info."""
    client = _get_client()
    info = client.version()
    return {
        "api_version": info.get("ApiVersion", "unknown"),
        "os": info.get("Os", "unknown"),
        "arch": info.get("Arch", "unknown"),
        "version": info.get("Version", "unknown"),
    }


def spawn(
    image: str,
    name: str | None = None,
    network: str | None = None,
    extra_env: dict[str, str] | None = None,
    extra_labels: dict[str, str] | None = None,
    cert_mounts: dict[str, dict[str, str]] | None = None,
) -> ContainerInfo:
    """Start a new sandbox container and return its info.

    All agent/LLM configuration is passed via ``extra_env`` (notably the
    ``CODEBOX_AGENT_CONFIG`` JSON env var) — this function is deliberately
    agnostic to the agent protocol.
    """
    client = _get_client()
    environment: dict[str, str] = dict(extra_env) if extra_env else {}

    volumes: dict[str, dict[str, str]] = {}

    # Named volume for /workspace so the container service owns storage
    workspace_vol_name = f"{name}-workspace" if name else f"codebox-workspace-{id(client)}"
    volumes[workspace_vol_name] = {"bind": "/workspace", "mode": "rw"}

    if cert_mounts:
        volumes.update(cert_mounts)

    # Named volume for /app so devbox cache and codebox state persist across restarts
    app_vol_name = f"{name}-app" if name else f"codebox-app-{id(client)}"
    volumes[app_vol_name] = {"bind": "/app", "mode": "rw"}

    labels = {CONTAINER_LABEL: "true"}
    if extra_labels:
        labels.update(extra_labels)
    net = network or settings.box.network

    # --- Security hardening ---------------------------------------------------
    # Drop Linux capabilities the sandbox agent never needs.
    # Keeps: CHOWN, DAC_OVERRIDE, FOWNER, SETUID, SETGID,
    #        NET_BIND_SERVICE, SYS_CHROOT, KILL (Docker defaults minus drops).
    _cap_drop = ["SYS_ADMIN", "NET_RAW", "MKNOD", "AUDIT_WRITE", "SETFCAP"]

    # Resource limits — configurable via env vars (see config.py).
    _resource_kwargs: dict[str, Any] = {
        "mem_limit": settings.box.memory_limit,
        "memswap_limit": settings.box.memory_limit,  # disable swap
        "cpu_period": 100_000,
        "cpu_quota": settings.box.cpu_limit * 100_000,
        "pids_limit": settings.box.pids_limit,
    }

    run_kwargs: dict[str, Any] = {
        "detach": True,
        "name": name,
        "environment": environment,
        "volumes": volumes,
        "labels": labels,
        "cap_drop": _cap_drop,
        "security_opt": ["no-new-privileges:true"],
        **_resource_kwargs,
    }
    if sys.platform == "win32" and settings.container.runtime == "podman":
        # Use host networking so the container shares the WSL VM's network
        # stack, which with mirrored networking can reach the Windows host.
        run_kwargs["network_mode"] = "host"
    else:
        run_kwargs["network"] = net
        # Ensure the network exists
        _ensure_network(client, net)
        if settings.container.runtime != "podman":
            run_kwargs["extra_hosts"] = {"host.docker.internal": "host-gateway"}

    # Always pull the latest image to avoid stale cached tags.
    try:
        client.images.pull(image)
    except docker.errors.APIError:
        logger.warning("Failed to pull image %s, using local cache", image)

    try:
        container = client.containers.run(image, **run_kwargs)
    except docker.errors.ImageNotFound as exc:
        raise DockerServiceError(f"Image not found: {image}") from exc
    except docker.errors.APIError as exc:
        raise DockerServiceError(f"Docker API error: {exc}") from exc

    container.reload()

    return ContainerInfo(
        id=container.id,
        name=container.name,
    )


def list_running() -> list[ContainerInfo]:
    """List running sandbox containers."""
    return list_containers(all=False)


# Docker returns this sentinel for containers that have never started.
_DOCKER_ZERO_TIME = "0001-01-01T00:00:00Z"


def list_containers(all: bool = True, project_id: str | None = None) -> list[ContainerInfo]:  # noqa: A002
    """List sandbox containers. When *all* is True, includes stopped containers."""
    client = _get_client()

    label_filters = [f"{CONTAINER_LABEL}=true"]
    if project_id:
        label_filters.append(f"codebox.project-id={project_id}")

    try:
        containers = client.containers.list(
            all=all,
            filters={"label": label_filters},
        )
    except docker.errors.APIError as exc:
        raise DockerServiceError(f"Docker API error: {exc}") from exc

    results: list[ContainerInfo] = []
    for c in containers:
        config = c.attrs.get("Config", {})
        labels = config.get("Labels", {})

        # Provider / model are stored as labels by the lifecycle service.
        # We no longer fall back to reading raw env vars — agent config lives
        # in the opaque CODEBOX_AGENT_CONFIG JSON blob.
        provider = labels.get("codebox.provider", "")
        model = labels.get("codebox.model", "")

        image = c.image.tags[0] if c.image.tags else c.image.short_id

        state = c.attrs.get("State", {})
        started_at = state.get("StartedAt")
        if started_at and started_at.startswith("0001-"):
            started_at = None
        created_at = c.attrs.get("Created")

        # Parse github issue number from label
        gh_issue_str = labels.get("codebox.github-issue-number", "")
        gh_issue_number = int(gh_issue_str) if gh_issue_str else None

        results.append(
            ContainerInfo(
                id=c.id,
                name=c.name,
                status=c.status,
                provider=provider,
                model=model,
                image=image,
                started_at=started_at,
                created_at=created_at or labels.get("codebox.created-at"),
                box_id=labels.get("codebox.box-id", ""),
                box_name=labels.get("codebox.name", ""),
                project_id=labels.get("codebox.project-id", ""),
                trigger=labels.get("codebox.trigger", ""),
                description=labels.get("codebox.description", ""),
                tags=(
                    labels.get("codebox.tags", "").split(",")
                    if labels.get("codebox.tags")
                    else None
                ),
                github_repo=labels.get("codebox.github-repo", ""),
                github_branch=labels.get("codebox.github-branch", ""),
                github_issue_number=gh_issue_number,
            )
        )
    return results


def stop(container_id_or_name: str, force: bool = False) -> None:
    """Stop a sandbox container (does not remove it)."""
    client = _get_client()
    container = _get_container(client, container_id_or_name)

    try:
        if force:
            container.kill()
        else:
            container.stop()
    except docker.errors.APIError as exc:
        raise DockerServiceError(f"Failed to stop container: {exc}") from exc


def start(container_id_or_name: str) -> None:
    """Start a stopped sandbox container."""
    client = _get_client()
    container = _get_container(client, container_id_or_name)
    try:
        container.start()
    except docker.errors.APIError as exc:
        raise DockerServiceError(f"Failed to start container: {exc}") from exc


def remove(container_id_or_name: str) -> None:
    """Remove a container (running or stopped) and its /app named volume."""
    client = _get_client()
    container = _get_container(client, container_id_or_name)
    container_name = container.name
    try:
        container.remove(force=True)
    except docker.errors.APIError as exc:
        raise DockerServiceError(f"Failed to remove container: {exc}") from exc

    # Clean up per-box named volumes
    if container_name:
        for suffix in ("-app", "-workspace"):
            try:
                vol = client.volumes.get(f"{container_name}{suffix}")
                vol.remove(force=True)
            except docker.errors.NotFound:
                pass
            except docker.errors.APIError:
                pass


def get_logs(container_id_or_name: str, tail: int = 200) -> str:
    """Fetch stdout/stderr logs from a container."""
    client = _get_client()
    container = _get_container(client, container_id_or_name)
    try:
        output = container.logs(
            stdout=True,
            stderr=True,
            tail=tail,
            timestamps=True,
        )
        return output.decode("utf-8", errors="replace")
    except docker.errors.APIError as exc:
        raise DockerServiceError(f"Failed to get logs: {exc}") from exc


def exec_commands(container_id_or_name: str, commands: list[str]) -> list[tuple[int, str]]:
    """Execute a list of shell commands inside a running container.

    Raises DockerServiceError if any command returns a non-zero exit code.
    Returns list of (exit_code, output) tuples for all executed commands.
    """
    client = _get_client()
    container = _get_container(client, container_id_or_name)
    results: list[tuple[int, str]] = []
    for cmd in commands:
        exit_code, output = container.exec_run(["bash", "-c", cmd], workdir="/")
        output_str = (
            output.decode("utf-8", errors="replace") if isinstance(output, bytes) else str(output)
        )
        results.append((exit_code, output_str))
        if exit_code != 0:
            raise DockerServiceError(
                f"Setup command failed (exit {exit_code}): {cmd}\n{output_str}"
            )
    return results


# ------------------------------------------------------------------
# Internal helpers
# ------------------------------------------------------------------


def _get_container(client: docker.DockerClient, container_id_or_name: str):
    try:
        return client.containers.get(container_id_or_name)
    except docker.errors.NotFound as exc:
        raise DockerServiceError(f"Container not found: {container_id_or_name}") from exc
    except docker.errors.APIError as exc:
        raise DockerServiceError(f"Docker API error: {exc}") from exc


def _ensure_network(client: docker.DockerClient, network_name: str) -> None:
    """Create the Docker network if it doesn't already exist."""
    try:
        client.networks.get(network_name)
    except docker.errors.NotFound:
        try:
            client.networks.create(network_name, driver="bridge")
            logger.info("Created Docker network: %s", network_name)
        except docker.errors.APIError as exc:
            raise DockerServiceError(f"Failed to create network {network_name}: {exc}") from exc
