"""Docker container management for Codebox sandboxes."""

from __future__ import annotations

import click
import docker
import docker.errors

from codebox_cli.config import CONTAINER_LABEL, DEFAULT_PORT


def _get_client() -> docker.DockerClient:
    try:
        return docker.from_env()
    except docker.errors.DockerException as exc:
        raise click.ClickException(
            f"Cannot connect to Docker daemon: {exc}"
        ) from exc


def spawn(
    image: str,
    name: str | None = None,
    model: str | None = None,
    api_key: str | None = None,
    mount_path: str | None = None,
    port: int | None = None,
) -> dict:
    """Start a new sandbox container and return its id, name, and host port."""
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

    try:
        container = client.containers.run(
            image,
            detach=True,
            name=name,
            ports=ports,
            environment=environment,
            volumes=volumes,
            labels=labels,
        )
    except docker.errors.ImageNotFound as exc:
        raise click.ClickException(f"Image not found: {image}") from exc
    except docker.errors.APIError as exc:
        raise click.ClickException(f"Docker API error: {exc}") from exc

    # Reload to get port mappings
    container.reload()
    host_port = _extract_host_port(container)

    return {
        "id": container.id,
        "name": container.name,
        "port": host_port,
        "mount_path": mount_path,
    }


def list_running() -> list[dict]:
    """List running Codebox sandbox containers."""
    client = _get_client()

    try:
        containers = client.containers.list(
            filters={"label": f"{CONTAINER_LABEL}=true"}
        )
    except docker.errors.APIError as exc:
        raise click.ClickException(f"Docker API error: {exc}") from exc

    results: list[dict] = []
    for c in containers:
        # Extract model from env vars
        env_list = c.attrs.get("Config", {}).get("Env", [])
        model = ""
        for e in env_list:
            if e.startswith("OPENROUTER_MODEL="):
                model = e.split("=", 1)[1]

        # Get image name
        image = c.image.tags[0] if c.image.tags else c.image.short_id

        results.append(
            {
                "id": c.id,
                "name": c.name,
                "status": c.status,
                "port": _extract_host_port(c),
                "created": c.attrs.get("Created", ""),
                "model": model,
                "image": image,
            }
        )
    return results


def stop(container_id_or_name: str, force: bool = False) -> None:
    """Stop and remove a sandbox container."""
    client = _get_client()

    try:
        container = client.containers.get(container_id_or_name)
    except docker.errors.NotFound as exc:
        raise click.ClickException(
            f"Container not found: {container_id_or_name}"
        ) from exc
    except docker.errors.APIError as exc:
        raise click.ClickException(f"Docker API error: {exc}") from exc

    try:
        if force:
            container.kill()
        else:
            container.stop()
        container.remove()
    except docker.errors.APIError as exc:
        raise click.ClickException(
            f"Failed to stop container: {exc}"
        ) from exc


def remove(container_id_or_name: str) -> None:
    """Remove a container (running or stopped)."""
    client = _get_client()
    try:
        container = client.containers.get(container_id_or_name)
    except docker.errors.NotFound as exc:
        raise click.ClickException(f"Container not found: {container_id_or_name}") from exc
    try:
        container.remove(force=True)
    except docker.errors.APIError as exc:
        raise click.ClickException(f"Failed to remove container: {exc}") from exc


def get_token(container_id_or_name: str) -> str:
    """Retrieve the daemon authentication token from a running container."""
    client = _get_client()

    try:
        container = client.containers.get(container_id_or_name)
    except docker.errors.NotFound as exc:
        raise click.ClickException(
            f"Container not found: {container_id_or_name}"
        ) from exc
    except docker.errors.APIError as exc:
        raise click.ClickException(f"Docker API error: {exc}") from exc

    try:
        exit_code, output = container.exec_run("cat /run/daemon-token")
    except docker.errors.APIError as exc:
        raise click.ClickException(
            f"Failed to read token from container: {exc}"
        ) from exc

    if exit_code != 0:
        raise click.ClickException(
            f"Failed to read token (exit code {exit_code}): {output.decode()}"
        )

    return output.decode().strip()


def get_port(container_id_or_name: str) -> int:
    """Get the host port mapped to container port 8443/tcp."""
    client = _get_client()

    try:
        container = client.containers.get(container_id_or_name)
    except docker.errors.NotFound as exc:
        raise click.ClickException(
            f"Container not found: {container_id_or_name}"
        ) from exc
    except docker.errors.APIError as exc:
        raise click.ClickException(f"Docker API error: {exc}") from exc

    port = _extract_host_port(container)
    if port is None:
        raise click.ClickException(
            f"No port mapping found for 8443/tcp on container {container_id_or_name}"
        )
    return port


def get_logs(
    container_id_or_name: str,
    follow: bool = False,
    tail: int = 100,
):
    """Yield log chunks from a container.

    When *follow* is True, yields indefinitely as new logs arrive.
    """
    client = _get_client()

    try:
        container = client.containers.get(container_id_or_name)
    except docker.errors.NotFound as exc:
        raise click.ClickException(
            f"Container not found: {container_id_or_name}"
        ) from exc
    except docker.errors.APIError as exc:
        raise click.ClickException(f"Docker API error: {exc}") from exc

    try:
        if follow:
            for chunk in container.logs(stream=True, follow=True, tail=tail):
                yield chunk.decode(errors="replace")
        else:
            output = container.logs(tail=tail)
            yield output.decode(errors="replace")
    except docker.errors.APIError as exc:
        raise click.ClickException(f"Failed to read logs: {exc}") from exc


def _extract_host_port(container: docker.models.containers.Container) -> int | None:
    """Extract the host port mapped to 8443/tcp from a container's port bindings."""
    ports = container.attrs.get("NetworkSettings", {}).get("Ports", {}) or {}
    bindings = ports.get("8443/tcp")
    if bindings and len(bindings) > 0:
        try:
            return int(bindings[0]["HostPort"])
        except (KeyError, ValueError, IndexError):
            return None
    return None
