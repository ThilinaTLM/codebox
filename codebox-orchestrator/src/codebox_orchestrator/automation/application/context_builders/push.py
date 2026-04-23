"""Context builder for the ``push`` GitHub webhook event."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from codebox_orchestrator.automation.application.context import TemplateContext
from codebox_orchestrator.automation.application.context_builders._common import (
    project_base_variables,
    repo_variables,
)

if TYPE_CHECKING:
    from codebox_orchestrator.integration.github.infrastructure.github_api_client import (
        GitHubApiClient,
    )


class PushContextBuilder:
    async def build(
        self,
        *,
        project_id: str,  # noqa: ARG002
        payload: dict[str, Any],
        api: GitHubApiClient | None = None,  # noqa: ARG002
        installation_id: int | None = None,  # noqa: ARG002
        template: Any = None,  # noqa: ARG002
        fired_at: Any = None,  # noqa: ARG002
    ) -> TemplateContext:
        ref = str(payload.get("ref") or "")
        sha_after = str(payload.get("after") or "")
        sha_before = str(payload.get("before") or "")
        pusher = str((payload.get("pusher") or {}).get("name") or "")
        commits = payload.get("commits") or []
        repository = payload.get("repository") or {}
        repo_full = str(repository.get("full_name") or "")

        commit_lines: list[str] = []
        for c in commits:
            if not isinstance(c, dict):
                continue
            sha = str(c.get("id") or "")
            short = sha[:7]
            author = str((c.get("author") or {}).get("name") or "")
            msg = str(c.get("message") or "").splitlines()[0] if c.get("message") else ""
            commit_lines.append(f"- {short} {author}: {msg}")

        variables = project_base_variables("github.push")
        variables.update(repo_variables(payload))
        variables.update(
            {
                "PUSH_REF": ref,
                "PUSH_SHA": sha_after,
                "PUSH_BEFORE": sha_before,
                "PUSH_PUSHER": pusher,
                "PUSH_COMMITS": "\n".join(commit_lines),
                "PUSH_COMMIT_COUNT": str(len(commits)),
            }
        )

        # Derive branch/tag from refs/heads/... or refs/tags/...
        branch = ""
        tag = ""
        if ref.startswith("refs/heads/"):
            branch = ref[len("refs/heads/") :]
        elif ref.startswith("refs/tags/"):
            tag = ref[len("refs/tags/") :]

        match_fields: dict[str, Any] = {
            "repo": repo_full,
            "ref": ref,
            "branch": branch,
            "tag": tag,
            "pusher": pusher,
            "commit_count": len(commits),
            "forced": bool(payload.get("forced")),
            "created": bool(payload.get("created")),
            "deleted": bool(payload.get("deleted")),
        }

        # Push trigger uses checkout_ref; branch_hint is the ref
        return TemplateContext(
            trigger_kind="github.push",
            variables=variables,
            match_fields=match_fields,
            repo=repo_full or None,
            branch_hint=ref or None,
            issue_number=None,
            integration_id=None,
            trigger_url=str(repository.get("html_url") or "") or None,
        )
