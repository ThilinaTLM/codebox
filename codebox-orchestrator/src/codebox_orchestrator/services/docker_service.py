"""Docker container lifecycle management for sandbox containers.

Adapted from codebox-cli/src/codebox_cli/docker_manager.py — same Docker SDK
patterns with click dependency removed.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass

import docker
import docker.errors

from codebox_orchestrator.config import CODEBOX_PORT, DOCKER_NETWORK

logger = logging.getLogger(__name__)

CONTAINER_LABEL = "codebox-sandbox"


class DockerServiceError(Exception):
    """Raised when a Docker operation fails."""


@dataclass
class ContainerInfo:
    id: str
    name: str
    port: int | None
    mount_path: str | None
    status: str = ""
    model: str = ""
    image: str = ""


def _get_client() -> docker.DockerClient:
    try:
        return docker.from_env()
    except docker.errors.DockerException as exc:
        raise DockerServiceError(f"Cannot connect to Docker daemon: {exc}") from exc


def spawn(
    image: str,
    name: str | None = None,
    model: str | None = None,
    api_key: str | None = None,
    mount_path: str | None = None,
    port: int | None = None,
    network: str | None = None,
) -> ContainerInfo:
    """Start a new sandbox container and return its info."""
    client = _get_client()

    environment: dict[str, str] = {}
    if api_key:
        environment["OPENROUTER_API_KEY"] = api_key
    if model:
        environment["OPENROUTER_MODEL"] = model

    ports: dict[str, int | None] = {"8443/tcp": port}

    volumes: dict[str, dict[str, str]] = {}
    if mount_path:
        volumes[mount_path] = {"bind": "/workspace", "mode": "rw"}

    labels = {CONTAINER_LABEL: "true"}
    net = network or DOCKER_NETWORK

    # Ensure the network exists
    _ensure_network(client, net)

    try:
        container = client.containers.run(
            image,
            detach=True,
            name=name,
            ports=ports,
            environment=environment,
            volumes=volumes,
            labels=labels,
            network=net,
        )
    except docker.errors.ImageNotFound as exc:
        raise DockerServiceError(f"Image not found: {image}") from exc
    except docker.errors.APIError as exc:
        raise DockerServiceError(f"Docker API error: {exc}") from exc

    container.reload()
    host_port = _extract_host_port(container)

    return ContainerInfo(
        id=container.id,
        name=container.name,
        port=host_port,
        mount_path=mount_path,
    )


def list_running() -> list[ContainerInfo]:
    """List running sandbox containers."""
    client = _get_client()

    try:
        containers = client.containers.list(
            filters={"label": f"{CONTAINER_LABEL}=true"}
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

        results.append(
            ContainerInfo(
                id=c.id,
                name=c.name,
                port=_extract_host_port(c),
                mount_path=None,
                status=c.status,
                model=model,
                image=image,
            )
        )
    return results


def stop(container_id_or_name: str, force: bool = False) -> None:
    """Stop and remove a sandbox container."""
    client = _get_client()
    container = _get_container(client, container_id_or_name)

    try:
        if force:
            container.kill()
        else:
            container.stop()
        container.remove()
    except docker.errors.APIError as exc:
        raise DockerServiceError(f"Failed to stop container: {exc}") from exc


def remove(container_id_or_name: str) -> None:
    """Remove a container (running or stopped)."""
    client = _get_client()
    container = _get_container(client, container_id_or_name)
    try:
        container.remove(force=True)
    except docker.errors.APIError as exc:
        raise DockerServiceError(f"Failed to remove container: {exc}") from exc


def get_token(container_id_or_name: str) -> str:
    """Retrieve the daemon authentication token from a running container."""
    client = _get_client()
    container = _get_container(client, container_id_or_name)

    try:
        exit_code, output = container.exec_run("cat /run/daemon-token")
    except docker.errors.APIError as exc:
        raise DockerServiceError(
            f"Failed to read token from container: {exc}"
        ) from exc

    if exit_code != 0:
        raise DockerServiceError(
            f"Failed to read token (exit code {exit_code}): {output.decode()}"
        )

    return output.decode().strip()


def get_port(container_id_or_name: str) -> int:
    """Get the host port mapped to container port 8443/tcp."""
    client = _get_client()
    container = _get_container(client, container_id_or_name)

    port = _extract_host_port(container)
    if port is None:
        raise DockerServiceError(
            f"No port mapping found for 8443/tcp on container {container_id_or_name}"
        )
    return port


def wait_for_healthy(container_name: str, timeout: int = 30) -> bool:
    """Poll the sandbox daemon health endpoint until it responds OK."""
    from codebox_orchestrator.services.sandbox_client import SandboxClient

    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            client = SandboxClient(host=container_name, port=CODEBOX_PORT)
            if client.check_health():
                return True
        except Exception:
            pass
        time.sleep(1)
    return False


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


def _extract_host_port(container) -> int | None:
    """Extract the host port mapped to 8443/tcp."""
    ports = container.attrs.get("NetworkSettings", {}).get("Ports", {}) or {}
    bindings = ports.get("8443/tcp")
    if bindings and len(bindings) > 0:
        try:
            return int(bindings[0]["HostPort"])
        except (KeyError, ValueError, IndexError):
            return None
    return None


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
