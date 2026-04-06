"""Box query service — assembles box views from Docker + gRPC state.

The orchestrator no longer stores box data in its database. This service
queries Docker for container metadata (labels) and enriches with live
gRPC state from the CallbackRegistry.
"""

from __future__ import annotations

import logging
from dataclasses import replace
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from codebox_orchestrator.agent.infrastructure.callback_registry import CallbackRegistry
    from codebox_orchestrator.agent.infrastructure.connection_adapter import AgentConnectionAdapter
    from codebox_orchestrator.box.infrastructure.box_state_store import BoxStateStore
    from codebox_orchestrator.compute.docker.docker_adapter import DockerRuntime

from codebox_orchestrator.box.domain.views import BoxView

logger = logging.getLogger(__name__)

# Map Docker status strings to our simplified status
_DOCKER_STATUS_MAP = {
    "running": "running",
    "created": "starting",
    "restarting": "starting",
    "paused": "stopped",
    "exited": "stopped",
    "dead": "stopped",
    "removing": "stopped",
}


class BoxQueryService:
    """Reads box state from Docker labels + gRPC registry."""

    def __init__(
        self,
        runtime: DockerRuntime,
        registry: CallbackRegistry,
        connections: AgentConnectionAdapter,
        state_store: BoxStateStore,
    ) -> None:
        self._runtime = runtime
        self._registry = registry
        self._connections = connections
        self._state_store = state_store

    def list_boxes(
        self,
        *,
        container_status: str | None = None,
        activity: str | None = None,
        trigger: str | None = None,
    ) -> list[BoxView]:
        """List all boxes from Docker, enriched with gRPC state."""
        containers = self._runtime.list_containers()
        docker_ids: set[str] = set()
        views = []
        for c in containers:
            if not c.box_id:
                continue  # Not a codebox box (legacy container without labels)
            docker_ids.add(c.box_id)
            view = self._enrich_with_error(self._container_to_view(c))
            views.append(view)

        # Include pending/failed boxes not yet visible in Docker
        views.extend(p for p in self._state_store.all_pending() if p.id not in docker_ids)

        # Apply filters
        if container_status or activity or trigger:
            views = [
                v
                for v in views
                if (not container_status or v.container_status == container_status)
                and (not activity or v.activity == activity)
                and (not trigger or v.trigger == trigger)
            ]
        return views

    def get_box(self, box_id: str) -> BoxView | None:
        """Get a single box by ID."""
        containers = self._runtime.list_containers()
        for c in containers:
            if c.box_id == box_id:
                return self._enrich_with_error(self._container_to_view(c))
        # Fall back to state store (phantom box — spawn failed or still pending)
        return self._state_store.get_pending(box_id)

    def _enrich_with_error(self, view: BoxView) -> BoxView:
        """Add error detail from the state store if available."""
        error = self._state_store.get_error(view.id)
        if error:
            return replace(view, error_detail=error)
        return view

    async def get_messages(self, box_id: str) -> list[dict[str, Any]]:
        """Get messages from sandbox via gRPC."""
        result = await self._connections.send_and_wait(
            box_id, {"type": "get_messages"}, timeout=10.0
        )
        return result.get("messages", [])

    async def get_box_state(self, box_id: str) -> dict[str, str]:
        """Get live box state from sandbox via gRPC."""
        result = await self._connections.send_and_wait(
            box_id, {"type": "get_box_state"}, timeout=10.0
        )
        return result

    def _container_to_view(self, c) -> BoxView:
        """Convert a ContainerInfo to a BoxView, enriched with gRPC state."""
        grpc_connected = self._connections.has_connection(c.box_id)
        live = self._registry.get_live_state(c.box_id) if grpc_connected else {}

        mapped_status = _DOCKER_STATUS_MAP.get(c.status, c.status)

        return BoxView(
            id=c.box_id,
            name=c.box_name or c.name,
            provider=c.provider,
            model=c.model,
            container_status=mapped_status,
            container_id=c.id,
            container_name=c.name,
            grpc_connected=grpc_connected,
            activity=live.get("activity"),
            task_outcome=live.get("task_outcome"),
            task_outcome_message=live.get("task_outcome_message"),
            trigger=c.trigger or None,
            github_repo=c.github_repo or None,
            github_branch=c.github_branch or None,
            github_issue_number=c.github_issue_number,
            created_at=c.created_at,
            started_at=c.started_at,
            image=c.image,
        )
