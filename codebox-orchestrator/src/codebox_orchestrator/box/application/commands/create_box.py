"""Create box command handler."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from codebox_orchestrator.box.application.name_generator import generate_readable_name
from codebox_orchestrator.box.domain.views import BoxView

if TYPE_CHECKING:
    from codebox_orchestrator.box.application.services.box_lifecycle import BoxLifecycleService
    from codebox_orchestrator.box.infrastructure.box_repository import BoxRepository
    from codebox_orchestrator.box.infrastructure.box_state_store import BoxStateStore
    from codebox_orchestrator.box.ports.event_publisher import EventPublisher


class CreateBoxHandler:
    def __init__(
        self,
        publisher: EventPublisher,
        lifecycle: BoxLifecycleService,
        state_store: BoxStateStore,
        box_repository: BoxRepository,
    ) -> None:
        self._publisher = publisher
        self._lifecycle = lifecycle
        self._state_store = state_store
        self._box_repository = box_repository

    async def execute(
        self,
        name: str | None = None,
        description: str | None = None,
        tags: list[str] | None = None,
        provider: str = "",
        model: str = "",
        api_key: str = "",
        base_url: str | None = None,
        tavily_api_key: str | None = None,
        system_prompt: str | None = None,
        auto_start_prompt: str | None = None,
        recursion_limit: int | None = None,
        tool_settings: dict[str, Any] | None = None,
        trigger: str | None = None,
        github_installation_id: str | None = None,
        github_repo: str | None = None,
        github_issue_number: int | None = None,
        github_trigger_url: str | None = None,
        github_branch: str | None = None,
        init_bash_script: str | None = None,
        project_id: str = "",
        created_by: str | None = None,
    ) -> BoxView:
        box_id = str(uuid.uuid4())
        box_name = name or generate_readable_name()
        now = datetime.now(UTC)

        await self._box_repository.create(
            box_id=box_id,
            project_id=project_id,
            created_by=created_by,
            name=box_name,
            description=description,
            tags=tags,
            provider=provider,
            model=model,
            trigger=trigger or "manual",
            github_repo=github_repo,
            github_branch=github_branch,
            github_issue_number=github_issue_number,
        )

        await self._publisher.publish_box_event(
            box_id, {"type": "status_change", "container_status": "starting"}
        )
        await self._publisher.publish_global_event(
            {
                "type": "box_created",
                "box_id": box_id,
                "name": box_name,
                "provider": provider,
                "container_status": "starting",
                "model": model,
                "created_at": now.isoformat(),
            }
        )

        self._lifecycle.start_box(
            box_id=box_id,
            name=box_name,
            description=description,
            tags=tags,
            provider=provider,
            model=model,
            api_key=api_key,
            base_url=base_url,
            tavily_api_key=tavily_api_key,
            system_prompt=system_prompt,
            auto_start_prompt=auto_start_prompt,
            recursion_limit=recursion_limit,
            tool_settings=tool_settings,
            trigger=trigger,
            github_installation_id=github_installation_id,
            github_repo=github_repo,
            github_issue_number=github_issue_number,
            github_trigger_url=github_trigger_url,
            github_branch=github_branch,
            init_bash_script=init_bash_script,
            project_id=project_id,
        )

        view = BoxView(
            id=box_id,
            name=box_name,
            provider=provider,
            model=model,
            container_status="starting",
            container_id="",
            container_name=f"codebox-box-{box_id[:8]}",
            grpc_connected=False,
            project_id=project_id,
            description=description,
            tags=tags,
            trigger=trigger,
            github_repo=github_repo,
            github_branch=github_branch,
            github_issue_number=github_issue_number,
            created_at=now.isoformat(),
        )
        self._state_store.register(view)
        return view
