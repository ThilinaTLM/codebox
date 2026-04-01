"""Docker/Podman container runtime adapter."""

from __future__ import annotations

from codebox_orchestrator.compute.docker import docker_service
from codebox_orchestrator.compute.domain.entities import ContainerConfig, ContainerInfo

# Re-export the error type
DockerServiceError = docker_service.DockerServiceError


class DockerRuntime:
    """ContainerRuntime implementation using Docker/Podman via docker_service module."""

    def check_connection(self) -> dict[str, str]:
        return docker_service.check_connection()

    def spawn(self, config: ContainerConfig) -> ContainerInfo:
        info = docker_service.spawn(
            image=config.image,
            name=config.name,
            model=config.model,
            api_key=config.api_key,
            tavily_api_key=config.tavily_api_key,
            mount_path=config.mount_path,
            network=config.network,
            extra_env=config.extra_env,
        )
        return ContainerInfo(
            id=info.id,
            name=info.name,
            mount_path=info.mount_path,
        )

    def stop(self, container_id_or_name: str) -> None:
        docker_service.stop(container_id_or_name)

    def start(self, container_id_or_name: str) -> None:
        docker_service.start(container_id_or_name)

    def remove(self, container_id_or_name: str) -> None:
        docker_service.remove(container_id_or_name)

    def list_containers(self) -> list[docker_service.ContainerInfo]:
        return docker_service.list_containers()

    def get_logs(self, container_id_or_name: str, tail: int = 200) -> str:
        return docker_service.get_logs(container_id_or_name, tail=tail)

    def exec_commands(
        self, container_id_or_name: str, commands: list[str]
    ) -> list[tuple[int, str]]:
        return docker_service.exec_commands(container_id_or_name, commands)

    def reset_client(self) -> None:
        docker_service.reset_client()
