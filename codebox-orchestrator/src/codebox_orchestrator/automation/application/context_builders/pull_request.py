"""Context builder for the ``pull_request`` GitHub webhook event."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from codebox_orchestrator.automation.application.context import TemplateContext
from codebox_orchestrator.automation.application.context_builders._common import (
    format_comments,
    format_review_comments,
    issue_variables,
    labels_list,
    project_base_variables,
    repo_variables,
)
from codebox_orchestrator.automation.application.context_builders._common import (
    installation_id as _installation_id,
)

if TYPE_CHECKING:
    from codebox_orchestrator.integration.github.infrastructure.github_api_client import (
        GitHubApiClient,
    )


class PullRequestContextBuilder:
    async def build(
        self,
        *,
        project_id: str,  # noqa: ARG002
        payload: dict[str, Any],
        api: GitHubApiClient | None = None,
        installation_id: int | None = None,
        template: Any = None,  # noqa: ARG002
        fired_at: Any = None,  # noqa: ARG002
    ) -> TemplateContext:
        action = str(payload.get("action") or "")
        pr = payload.get("pull_request") or {}
        repository = payload.get("repository") or {}

        # GitHub treats PRs as issues for comment purposes; build both sets.
        variables = project_base_variables("github.pull_request")
        variables.update(repo_variables(payload))
        variables.update(issue_variables(pr, action))
        head = pr.get("head") or {}
        base = pr.get("base") or {}
        variables.update(
            {
                "PR_URL": str(pr.get("html_url") or ""),
                "PR_NUMBER": str(pr.get("number") or ""),
                "PR_HEAD_REF": str(head.get("ref") or ""),
                "PR_BASE_REF": str(base.get("ref") or ""),
            }
        )

        inst_id = installation_id or _installation_id(payload)
        repo_full = str(repository.get("full_name") or "")
        pr_number = int(pr.get("number") or 0)
        changed_files = ""
        review_comments = ""
        if api is not None and inst_id is not None and repo_full and pr_number:
            try:
                ctx = await api.extract_issue_context(
                    inst_id, repo_full, pr_number, is_pull_request=True
                )
                variables["ISSUE_COMMENTS"] = format_comments(ctx.get("comments", []))
                changed_files = "\n".join(ctx.get("changed_files", []) or [])
                review_comments = format_review_comments(ctx.get("review_comments", []))
            except Exception:
                variables["ISSUE_COMMENTS"] = ""
        else:
            variables.setdefault("ISSUE_COMMENTS", "")
        variables["PR_CHANGED_FILES"] = changed_files
        variables["PR_REVIEW_COMMENTS"] = review_comments

        match_fields = {
            "repo": repo_full,
            "action": action,
            "labels": labels_list(pr),
            "author": str((pr.get("user") or {}).get("login") or ""),
            "title": str(pr.get("title") or ""),
            "base_ref": str(base.get("ref") or ""),
            "head_ref": str(head.get("ref") or ""),
            "draft": bool(pr.get("draft")),
        }

        return TemplateContext(
            trigger_kind="github.pull_request",
            variables=variables,
            match_fields=match_fields,
            repo=repo_full or None,
            branch_hint=str(head.get("ref") or "") or None,
            issue_number=pr_number or None,
            integration_id=None,
            trigger_url=str(pr.get("html_url") or "") or None,
        )
