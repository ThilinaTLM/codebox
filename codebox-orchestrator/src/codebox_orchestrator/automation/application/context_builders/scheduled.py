"""Context builder for ``schedule`` (cron) triggers."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from codebox_orchestrator.automation.application.context import TemplateContext
from codebox_orchestrator.automation.application.context_builders._common import (
    project_base_variables,
)

if TYPE_CHECKING:
    from codebox_orchestrator.automation.models import Automation
    from codebox_orchestrator.integration.github.infrastructure.github_api_client import (
        GitHubApiClient,
    )


class ScheduledContextBuilder:
    """Produces a context for a scheduled firing.

    Unlike GitHub builders, this one is invoked by the scheduler with the
    *automation* itself rather than a webhook payload.
    """

    async def build(
        self,
        *,
        project_id: str,  # noqa: ARG002
        payload: dict[str, Any] | None = None,  # noqa: ARG002
        api: GitHubApiClient | None = None,  # noqa: ARG002
        installation_id: int | None = None,  # noqa: ARG002
        automation: Automation | None = None,
        fired_at: datetime | None = None,
    ) -> TemplateContext:
        if automation is None:
            raise ValueError("scheduled context builder requires an automation")
        fired = fired_at or datetime.now(UTC)
        variables = project_base_variables("schedule")
        variables.update(
            {
                "SCHEDULE_CRON": str(automation.schedule_cron or ""),
                "SCHEDULE_TIMEZONE": str(automation.schedule_timezone or "UTC"),
                "SCHEDULED_AT": fired.replace(microsecond=0).isoformat(),
                "REPO_FULL_NAME": str(automation.trigger_repo or ""),
                "REPO_URL": (
                    f"https://github.com/{automation.trigger_repo}"
                    if automation.trigger_repo
                    else ""
                ),
                "REPO_DEFAULT_BRANCH": str(automation.pinned_branch or ""),
            }
        )

        # ``schedule`` has no predicate fields in ``ALLOWED_FIELDS``; keep an
        # empty match_fields dict so the matcher's allow-list check short-circuits.
        match_fields: dict[str, Any] = {}

        return TemplateContext(
            trigger_kind="schedule",
            variables=variables,
            match_fields=match_fields,
            repo=automation.trigger_repo,
            branch_hint=automation.pinned_branch,
            issue_number=None,
            integration_id=None,
            trigger_url=None,
        )
