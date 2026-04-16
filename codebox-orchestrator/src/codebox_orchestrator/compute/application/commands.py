"""Compute application commands wrapping container runtime operations."""

from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from codebox_orchestrator.compute.domain.entities import ContainerConfig, ContainerInfo
    from codebox_orchestrator.compute.ports.container_runtime import ContainerRuntime


class ProvisionContainerHandler:
    def __init__(self, runtime: ContainerRuntime) -> None:
        self._runtime = runtime

    async def execute(self, config: ContainerConfig) -> ContainerInfo:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, self._runtime.spawn, config)


class StopContainerHandler:
    def __init__(self, runtime: ContainerRuntime) -> None:
        self._runtime = runtime

    async def execute(self, container_id_or_name: str) -> None:
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, self._runtime.stop, container_id_or_name)


class RestartContainerHandler:
    def __init__(self, runtime: ContainerRuntime) -> None:
        self._runtime = runtime

    async def execute(self, container_id_or_name: str) -> None:
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, self._runtime.start, container_id_or_name)


class RemoveContainerHandler:
    def __init__(self, runtime: ContainerRuntime) -> None:
        self._runtime = runtime

    async def execute(self, container_id_or_name: str) -> None:
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, self._runtime.remove, container_id_or_name)
