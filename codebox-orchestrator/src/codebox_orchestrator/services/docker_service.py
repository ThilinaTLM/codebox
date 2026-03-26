"""Container runtime lifecycle management for sandbox containers.

Supports Docker and Podman via configurable connection backends:
local sockets, remote TCP/TLS, and SSH.
"""

from __future__ import annotations

import logging
import re
import sys
from dataclasses import dataclass
from typing import Any

import docker
import docker.errors
import docker.tls

from codebox_orchestrator.config import (
    CONTAINER_RUNTIME_TYPE,
    CONTAINER_RUNTIME_URL,
    CONTAINER_TLS_CERT,
    CONTAINER_TLS_KEY,
    CONTAINER_TLS_VERIFY,
    DOCKER_NETWORK,
)

logger = logging.getLogger(__name__)

CONTAINER_LABEL = "codebox-sandbox"

_client: docker.DockerClient | None = None


class DockerServiceError(Exception):
    """Raised when a container runtime operation fails."""


@dataclass
class ContainerInfo:
    id: str
    name: str
    mount_path: str | None
    status: str = ""
    model: str = ""
    image: str = ""
    started_at: str | None = None
    created_at: str | None = None


def _get_client() -> docker.DockerClient:
    global _client
    if _client is not None:
        return _client
    try:
        if not CONTAINER_RUNTIME_URL:
            _client = docker.from_env()
        else:
            kwargs: dict[str, Any] = {"base_url": CONTAINER_RUNTIME_URL}
            if CONTAINER_TLS_CERT and CONTAINER_TLS_KEY:
                tls_config = docker.tls.TLSConfig(
                    client_cert=(CONTAINER_TLS_CERT, CONTAINER_TLS_KEY),
                    ca_cert=CONTAINER_TLS_VERIFY if CONTAINER_TLS_VERIFY not in ("", "true", "false") else None,
                    verify=CONTAINER_TLS_VERIFY != "false",
                )
                kwargs["tls"] = tls_config
            _client = docker.DockerClient(**kwargs)
        return _client
    except docker.errors.DockerException as exc:
        raise DockerServiceError(f"Cannot connect to container runtime: {exc}") from exc


def reset_client() -> None:
    """Clear the cached client (useful for testing)."""
    global _client
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
    model: str | None = None,
    api_key: str | None = None,
    tavily_api_key: str | None = None,
    mount_path: str | None = None,
    network: str | None = None,
    extra_env: dict[str, str] | None = None,
) -> ContainerInfo:
    """Start a new sandbox container and return its info."""
    client = _get_client()

    environment: dict[str, str] = {}
    if api_key:
        environment["OPENROUTER_API_KEY"] = api_key
    if model:
        environment["OPENROUTER_MODEL"] = model
    if tavily_api_key:
        environment["TAVILY_API_KEY"] = tavily_api_key
    if extra_env:
        environment.update(extra_env)

    volumes: dict[str, dict[str, str]] = {}
    if mount_path:
        host_path = mount_path
        if sys.platform == "win32" and CONTAINER_RUNTIME_TYPE == "podman":
            host_path = _to_wsl_path(mount_path)
        volumes[host_path] = {"bind": "/workspace", "mode": "rw"}

    labels = {CONTAINER_LABEL: "true"}
    net = network or DOCKER_NETWORK

    run_kwargs: dict[str, Any] = {
        "detach": True,
        "name": name,
        "environment": environment,
        "volumes": volumes,
        "labels": labels,
    }
    if sys.platform == "win32" and CONTAINER_RUNTIME_TYPE == "podman":
        # Use host networking so the container shares the WSL VM's network
        # stack, which with mirrored networking can reach the Windows host.
        run_kwargs["network_mode"] = "host"
    else:
        run_kwargs["network"] = net
        # Ensure the network exists
        _ensure_network(client, net)
        if CONTAINER_RUNTIME_TYPE != "podman":
            run_kwargs["extra_hosts"] = {"host.docker.internal": "host-gateway"}

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
        mount_path=mount_path,
    )


def list_running() -> list[ContainerInfo]:
    """List running sandbox containers."""
    return list_containers(all=False)


# Docker returns this sentinel for containers that have never started.
_DOCKER_ZERO_TIME = "0001-01-01T00:00:00Z"


def list_containers(all: bool = True) -> list[ContainerInfo]:
    """List sandbox containers. When *all* is True, includes stopped containers."""
    client = _get_client()

    try:
        containers = client.containers.list(
            all=all,
            filters={"label": f"{CONTAINER_LABEL}=true"},
        )
    except docker.errors.APIError as exc:
        raise DockerServiceError(f"Docker API error: {exc}") from exc

    results: list[ContainerInfo] = []
    for c in containers:
        env_list = c.attrs.get("Config", {}).get("Env", [])
        model = ""
        for e in env_list:
            if e.startswith("OPENROUTER_MODEL="):
                model = e.split("=", 1)[1]

        image = c.image.tags[0] if c.image.tags else c.image.short_id

        state = c.attrs.get("State", {})
        started_at = state.get("StartedAt")
        if started_at and started_at.startswith("0001-"):
            started_at = None
        created_at = c.attrs.get("Created")

        results.append(
            ContainerInfo(
                id=c.id,
                name=c.name,
                mount_path=None,
                status=c.status,
                model=model,
                image=image,
                started_at=started_at,
                created_at=created_at,
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
    """Remove a container (running or stopped)."""
    client = _get_client()
    container = _get_container(client, container_id_or_name)
    try:
        container.remove(force=True)
    except docker.errors.APIError as exc:
        raise DockerServiceError(f"Failed to remove container: {exc}") from exc


def exec_commands(
    container_id_or_name: str, commands: list[str]
) -> list[tuple[int, str]]:
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
            output.decode("utf-8", errors="replace")
            if isinstance(output, bytes)
            else str(output)
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
        raise DockerServiceError(
            f"Container not found: {container_id_or_name}"
        ) from exc
    except docker.errors.APIError as exc:
        raise DockerServiceError(f"Docker API error: {exc}") from exc


def _to_wsl_path(win_path: str) -> str:
    """Convert a Windows path like C:\\Users\\foo to /mnt/c/Users/foo for WSL."""
    p = win_path.replace("\\", "/")
    m = re.match(r"^([A-Za-z]):/(.*)$", p)
    if m:
        return f"/mnt/{m.group(1).lower()}/{m.group(2)}"
    return p


def _ensure_network(client: docker.DockerClient, network_name: str) -> None:
    """Create the Docker network if it doesn't already exist."""
    try:
        client.networks.get(network_name)
    except docker.errors.NotFound:
        try:
            client.networks.create(network_name, driver="bridge")
            logger.info("Created Docker network: %s", network_name)
        except docker.errors.APIError as exc:
            raise DockerServiceError(
                f"Failed to create network {network_name}: {exc}"
            ) from exc
