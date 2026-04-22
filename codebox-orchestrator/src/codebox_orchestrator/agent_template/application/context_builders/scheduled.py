"""Context builder for ``schedule`` (cron) triggers."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from codebox_orchestrator.agent_template.application.context import TemplateContext
from codebox_orchestrator.agent_template.application.context_builders._common import (
    project_base_variables,
)

if TYPE_CHECKING:
    from codebox_orchestrator.agent_template.models import AgentTemplate
    from codebox_orchestrator.integration.github.infrastructure.github_api_client import (
        GitHubApiClient,
    )


class ScheduledContextBuilder:
    """Produces a context for a scheduled firing.

    Unlike GitHub builders, this one is invoked by the scheduler with the
    *template* itself rather than a webhook payload.
    """

    async def build(
        self,
        *,
        project_id: str,  # noqa: ARG002
        payload: dict[str, Any] | None = None,  # noqa: ARG002
        api: GitHubApiClient | None = None,  # noqa: ARG002
        installation_id: int | None = None,  # noqa: ARG002
        template: AgentTemplate | None = None,
        fired_at: datetime | None = None,
    ) -> TemplateContext:
        if template is None:
            raise ValueError("scheduled context builder requires a template")
        fired = fired_at or datetime.now(UTC)
        variables = project_base_variables("schedule")
        variables.update(
            {
                "SCHEDULE_CRON": str(template.schedule_cron or ""),
                "SCHEDULE_TIMEZONE": str(template.schedule_timezone or "UTC"),
                "SCHEDULED_AT": fired.replace(microsecond=0).isoformat(),
                "REPO_FULL_NAME": str(template.pinned_repo or ""),
                "REPO_URL": (
                    f"https://github.com/{template.pinned_repo}" if template.pinned_repo else ""
                ),
                "REPO_DEFAULT_BRANCH": str(template.pinned_branch or ""),
            }
        )

        match_fields = {"repo": str(template.pinned_repo or "")}

        return TemplateContext(
            trigger_kind="schedule",
            variables=variables,
            match_fields=match_fields,
            repo=template.pinned_repo,
            branch_hint=template.pinned_branch,
            issue_number=None,
            integration_id=None,
            trigger_url=None,
        )
