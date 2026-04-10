"""Agent connection adapter wrapping CallbackRegistry.

Commands are sent as BoxCommand protobuf objects.
Queries use the protocol-level Query/QueryResult wrapper.
"""

from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING, Any

from codebox_orchestrator.agent.infrastructure.grpc.generated.codebox.box import box_pb2

if TYPE_CHECKING:
    from codebox_orchestrator.agent.infrastructure.callback_registry import CallbackRegistry


class AgentConnectionAdapter:
    """Implements AgentConnectionManager using CallbackRegistry."""

    def __init__(self, registry: CallbackRegistry) -> None:
        self._registry = registry

    @property
    def registry(self) -> CallbackRegistry:
        """Direct access for gRPC server (needs set_connection etc.)."""
        return self._registry

    def has_connection(self, box_id: str) -> bool:
        return self._registry.get_connection(box_id) is not None

    async def send_command(self, box_id: str, command: box_pb2.BoxCommand) -> None:
        """Send a BoxCommand protobuf to the box."""
        conn = self._registry.get_connection(box_id)
        if conn is None:
            from codebox_orchestrator.agent.domain.exceptions import (  # noqa: PLC0415
                NoActiveConnectionError,
            )

            raise NoActiveConnectionError(box_id)
        await conn.command_queue.put(command)

    async def send_query(
        self,
        box_id: str,
        query: box_pb2.Query,
        timeout: float,  # noqa: ASYNC109
    ) -> Any:
        """Send a Query and wait for the matching QueryResult.

        The request_id is generated and set on the Query protobuf.
        Returns the QueryResult protobuf.
        """
        conn = self._registry.get_connection(box_id)
        if conn is None:
            from codebox_orchestrator.agent.domain.exceptions import (  # noqa: PLC0415
                NoActiveConnectionError,
            )

            raise NoActiveConnectionError(box_id)
        request_id, fut = self._registry.create_pending_request(box_id)
        query.request_id = request_id
        cmd = box_pb2.BoxCommand(query=query)
        await conn.command_queue.put(cmd)
        return await asyncio.wait_for(fut, timeout=timeout)

    async def wait_for_connection(self, box_id: str, timeout: float) -> bool:  # noqa: ASYNC109
        return await self._registry.wait_for_connection(box_id, timeout=timeout)

    def init_connection_state(self, box_id: str) -> None:
        self._registry.init_connection_state(box_id)

    def remove_connection(self, box_id: str) -> None:
        self._registry.remove(box_id)

    def remove_connection_fully(self, box_id: str) -> None:
        self._registry.remove_fully(box_id)
