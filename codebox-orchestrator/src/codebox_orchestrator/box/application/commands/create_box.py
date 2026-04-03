"""Create box command handler."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from codebox_orchestrator.box.application.name_generator import generate_readable_name
from codebox_orchestrator.box.domain.views import BoxView
from codebox_orchestrator.config import LLM_MODEL, LLM_PROVIDER

if TYPE_CHECKING:
    from codebox_orchestrator.box.application.services.box_lifecycle import BoxLifecycleService
    from codebox_orchestrator.box.ports.event_publisher import EventPublisher


class CreateBoxHandler:
    def __init__(self, publisher: EventPublisher, lifecycle: BoxLifecycleService) -> None:
        self._publisher = publisher
        self._lifecycle = lifecycle

    async def execute(
        self,
        name: str | None = None,
        provider: str | None = None,
        model: str | None = None,
        dynamic_system_prompt: str | None = None,
        initial_prompt: str | None = None,
        trigger: str | None = None,
        github_installation_id: str | None = None,
        github_repo: str | None = None,
        github_issue_number: int | None = None,
        github_trigger_url: str | None = None,
        github_branch: str | None = None,
    ) -> BoxView:
        box_id = str(uuid.uuid4())
        box_name = name or generate_readable_name()
        box_provider = provider or LLM_PROVIDER
        box_model = model or LLM_MODEL
        now = datetime.now(UTC)

        # Publish creation events
        await self._publisher.publish_box_event(
            box_id, {"type": "status_change", "container_status": "starting"}
        )
        await self._publisher.publish_global_event(
            {
                "type": "box_created",
                "box_id": box_id,
                "name": box_name,
                "provider": box_provider,
                "container_status": "starting",
                "model": box_model,
                "created_at": now.isoformat(),
            }
        )

        # Launch container in background
        self._lifecycle.start_box(
            box_id=box_id,
            name=box_name,
            provider=box_provider,
            model=box_model,
            dynamic_system_prompt=dynamic_system_prompt,
            initial_prompt=initial_prompt,
            trigger=trigger,
            github_installation_id=github_installation_id,
            github_repo=github_repo,
            github_issue_number=github_issue_number,
            github_trigger_url=github_trigger_url,
            github_branch=github_branch,
        )

        return BoxView(
            id=box_id,
            name=box_name,
            provider=box_provider,
            model=box_model,
            container_status="starting",
            container_id="",
            container_name=f"codebox-box-{box_id[:8]}",
            grpc_connected=False,
            trigger=trigger,
            github_repo=github_repo,
            github_branch=github_branch,
            github_issue_number=github_issue_number,
            created_at=now.isoformat(),
        )
