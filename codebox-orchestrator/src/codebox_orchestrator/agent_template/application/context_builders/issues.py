"""Context builder for the ``issues`` GitHub webhook event."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from codebox_orchestrator.agent_template.application.context import TemplateContext
from codebox_orchestrator.agent_template.application.context_builders._common import (
    format_comments,
    issue_variables,
    labels_list,
    project_base_variables,
    repo_variables,
)
from codebox_orchestrator.agent_template.application.context_builders._common import (
    installation_id as _installation_id,
)

if TYPE_CHECKING:
    from codebox_orchestrator.integration.github.infrastructure.github_api_client import (
        GitHubApiClient,
    )


class IssuesContextBuilder:
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
        issue = payload.get("issue") or {}
        repository = payload.get("repository") or {}

        variables = project_base_variables("github.issues")
        variables.update(repo_variables(payload))
        variables.update(issue_variables(issue, action))

        inst_id = installation_id or _installation_id(payload)
        repo_full = str(repository.get("full_name") or "")
        issue_number = int(issue.get("number") or 0)
        if api is not None and inst_id is not None and repo_full and issue_number:
            try:
                ctx = await api.extract_issue_context(
                    inst_id, repo_full, issue_number, is_pull_request=False
                )
                variables["ISSUE_COMMENTS"] = format_comments(ctx.get("comments", []))
            except Exception:
                variables["ISSUE_COMMENTS"] = ""
        else:
            variables.setdefault("ISSUE_COMMENTS", "")

        author = str((issue.get("user") or {}).get("login") or "")
        match_fields = {
            "repo": repo_full,
            "action": action,
            "labels": labels_list(issue),
            "author": author,
            "title": str(issue.get("title") or ""),
            "state": str(issue.get("state") or ""),
        }

        return TemplateContext(
            trigger_kind="github.issues",
            variables=variables,
            match_fields=match_fields,
            repo=repo_full or None,
            branch_hint=str(repository.get("default_branch") or "") or None,
            issue_number=issue_number or None,
            integration_id=None,
            trigger_url=str(issue.get("html_url") or "") or None,
        )
