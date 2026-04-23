"""Per-trigger context builders and their registry."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Protocol

if TYPE_CHECKING:
    from codebox_orchestrator.automation.application.context import TemplateContext
    from codebox_orchestrator.integration.github.infrastructure.github_api_client import (
        GitHubApiClient,
    )


class ContextBuilder(Protocol):
    """Build a TemplateContext from a raw trigger payload."""

    async def build(
        self,
        *,
        project_id: str,
        payload: dict[str, Any] | None = None,
        api: GitHubApiClient | None = None,
        installation_id: int | None = None,
        automation: Any = None,
        fired_at: Any = None,
    ) -> TemplateContext: ...


class ContextBuilderRegistry:
    """Maps trigger_kind → builder. Construct via ``ContextBuilderRegistry.default()``."""

    def __init__(self, builders: dict[str, ContextBuilder]) -> None:
        self._builders = builders

    def get(self, trigger_kind: str) -> ContextBuilder | None:
        return self._builders.get(trigger_kind)

    @classmethod
    def default(cls) -> ContextBuilderRegistry:
        from codebox_orchestrator.automation.application.context_builders import (  # noqa: PLC0415
            issue_comment,
            issues,
            pr_review,
            pr_review_comment,
            pull_request,
            push,
            scheduled,
        )

        pr_review_comment_builder = pr_review_comment.PullRequestReviewCommentContextBuilder()
        return cls(
            {
                "github.issues": issues.IssuesContextBuilder(),
                "github.issue_comment": issue_comment.IssueCommentContextBuilder(),
                "github.pull_request": pull_request.PullRequestContextBuilder(),
                "github.pull_request_review": pr_review.PullRequestReviewContextBuilder(),
                "github.pull_request_review_comment": pr_review_comment_builder,
                "github.push": push.PushContextBuilder(),
                "schedule": scheduled.ScheduledContextBuilder(),
            }
        )
