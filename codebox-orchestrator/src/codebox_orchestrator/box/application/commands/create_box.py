"""Create box command handler."""

from __future__ import annotations

from datetime import datetime, timezone

from codebox_orchestrator.box.domain.entities import Box
from codebox_orchestrator.box.domain.enums import Activity, ContainerStatus
from codebox_orchestrator.box.ports.box_repository import BoxRepository
from codebox_orchestrator.box.ports.event_publisher import EventPublisher
from codebox_orchestrator.config import OPENROUTER_MODEL


class CreateBoxHandler:
    def __init__(self, repo: BoxRepository, publisher: EventPublisher) -> None:
        self._repo = repo
        self._publisher = publisher

    async def execute(
        self,
        name: str | None = None,
        model: str | None = None,
        system_prompt: str | None = None,
        initial_prompt: str | None = None,
        trigger: str | None = None,
        github_installation_id: str | None = None,
        github_repo: str | None = None,
        github_issue_number: int | None = None,
        github_trigger_url: str | None = None,
        github_branch: str | None = None,
    ) -> Box:
        box = Box(
            name=name or "box",
            model=model or OPENROUTER_MODEL,
            container_status=ContainerStatus.STARTING,
            activity=Activity.IDLE,
            system_prompt=system_prompt,
            initial_prompt=initial_prompt,
            trigger=trigger,
            github_installation_id=github_installation_id,
            github_repo=github_repo,
            github_issue_number=github_issue_number,
            github_trigger_url=github_trigger_url,
            github_branch=github_branch,
        )
        box.started_at = datetime.now(timezone.utc)
        await self._repo.save(box)

        await self._publisher.publish_box_event(
            box.id, {"type": "status_change", "container_status": ContainerStatus.STARTING.value}
        )
        await self._publisher.publish_global_event({
            "type": "box_created",
            "box_id": box.id,
            "name": box.name,
            "container_status": ContainerStatus.STARTING.value,
            "model": box.model,
            "created_at": box.created_at.isoformat(),
        })
        return box
