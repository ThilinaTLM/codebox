"""Box query service — assembles box views from DB metadata + Docker + gRPC state."""

from __future__ import annotations

import json
import logging
from dataclasses import replace
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from codebox_orchestrator.agent.infrastructure.callback_registry import CallbackRegistry
    from codebox_orchestrator.agent.infrastructure.connection_adapter import AgentConnectionAdapter
    from codebox_orchestrator.agent.infrastructure.event_repository import (
        SqlAlchemyBoxEventRepository,
    )
    from codebox_orchestrator.box.infrastructure.box_repository import BoxRepository
    from codebox_orchestrator.box.infrastructure.box_state_store import BoxStateStore
    from codebox_orchestrator.compute.docker.docker_adapter import DockerRuntime

from codebox_orchestrator.box.domain.views import BoxView

logger = logging.getLogger(__name__)

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
    """Reads box state from persisted metadata, Docker, and the gRPC registry."""

    def __init__(
        self,
        runtime: DockerRuntime,
        registry: CallbackRegistry,
        connections: AgentConnectionAdapter,
        state_store: BoxStateStore,
        event_repository: SqlAlchemyBoxEventRepository,
        box_repository: BoxRepository,
    ) -> None:
        self._runtime = runtime
        self._registry = registry
        self._connections = connections
        self._state_store = state_store
        self._event_repository = event_repository
        self._box_repository = box_repository

    async def list_boxes(
        self,
        *,
        project_id: str,
        container_status: str | None = None,
        activity: str | None = None,
        trigger: str | None = None,
    ) -> list[BoxView]:
        records = await self._box_repository.list_for_project(project_id)
        containers = {
            c.box_id: c for c in self._runtime.list_containers(project_id=project_id) if c.box_id
        }
        views: list[BoxView] = []
        for record in records:
            projection = await self._event_repository.get_projection(record.id)
            view = self._merge_record(record, containers.get(record.id), projection)
            views.append(self._enrich_with_error(view))

        if container_status or activity or trigger:
            views = [
                v
                for v in views
                if (not container_status or v.container_status == container_status)
                and (not activity or v.activity == activity)
                and (not trigger or v.trigger == trigger)
            ]
        return views

    async def get_box(self, box_id: str) -> BoxView | None:
        record = await self._box_repository.get(box_id)
        if record is not None:
            containers = {c.box_id: c for c in self._runtime.list_containers() if c.box_id}
            projection = await self._event_repository.get_projection(box_id)
            view = self._merge_record(record, containers.get(box_id), projection)
            return self._enrich_with_error(view)

        pending = self._state_store.get_pending(box_id)
        if pending is not None:
            return pending
        return None

    async def list_events(
        self,
        box_id: str,
        *,
        after_seq: int | None = None,
        limit: int | None = None,
    ) -> list[dict]:
        return await self._event_repository.list_events(box_id, after_seq=after_seq, limit=limit)

    def _enrich_with_error(self, view: BoxView) -> BoxView:
        error = self._state_store.get_error(view.id)
        if error:
            return replace(view, error_detail=error)
        return view

    def _merge_record(self, record, container, projection: dict | None) -> BoxView:
        grpc_connected = self._connections.has_connection(record.id)
        live = self._registry.get_live_state(record.id) if grpc_connected else {}
        tags = json.loads(record.tags_json) if record.tags_json else []

        container_status = "stopped"
        container_id = ""
        container_name = f"codebox-box-{record.id[:8]}"
        started_at = None
        image = ""
        if container is not None:
            container_status = _DOCKER_STATUS_MAP.get(container.status, container.status)
            container_id = container.id
            container_name = container.name
            started_at = container.started_at
            image = container.image

        return BoxView(
            id=record.id,
            name=record.name,
            provider=record.provider,
            model=record.model,
            container_status=container_status,
            container_id=container_id,
            container_name=container_name,
            grpc_connected=grpc_connected,
            project_id=record.project_id,
            activity=live.get("activity") or (projection or {}).get("activity"),
            box_outcome=live.get("box_outcome") or (projection or {}).get("box_outcome"),
            box_outcome_message=live.get("box_outcome_message")
            or (projection or {}).get("box_outcome_message"),
            trigger=record.trigger,
            description=record.description,
            tags=tags,
            github_repo=record.github_repo,
            github_branch=record.github_branch,
            github_issue_number=record.github_issue_number,
            created_at=record.created_at.isoformat() if record.created_at else None,
            started_at=started_at,
            image=image,
        )
