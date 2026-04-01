"""GitHub webhook processing handler."""

from __future__ import annotations

import json
import logging
import re
import uuid
from typing import TYPE_CHECKING

from codebox_orchestrator.config import GITHUB_DEFAULT_BASE_BRANCH
from codebox_orchestrator.integration.ports.integration_handler import BoxCreateRequest

if TYPE_CHECKING:
    from codebox_orchestrator.integration.github.infrastructure.github_api_client import (
        GitHubApiClient,
    )
    from codebox_orchestrator.integration.github.infrastructure.github_repository import (
        SqlAlchemyGitHubRepository,
    )

logger = logging.getLogger(__name__)


class GitHubWebhookHandler:
    """Processes GitHub webhooks and produces BoxCreateRequests."""

    def __init__(
        self,
        api_client: GitHubApiClient,
        repo: SqlAlchemyGitHubRepository,
    ) -> None:
        self._api = api_client
        self._repo = repo

    def verify_signature(self, payload: bytes, signature: str) -> bool:
        return self._api.verify_webhook_signature(payload, signature)

    async def process_webhook(
        self, event_type: str, delivery_id: str, payload: dict
    ) -> tuple[BoxCreateRequest | None, str | None]:
        """Process a GitHub webhook payload.

        Returns (request, event_id) — request is None when no box should
        be created.  event_id is always returned so callers can link the
        event to a box after creation.
        """
        # Dedup check
        if await self._repo.event_exists(delivery_id):
            logger.info("Duplicate webhook delivery %s, skipping", delivery_id)
            return None, None

        # Store event
        action = payload.get("action", "")
        repository = ""
        repo_data = payload.get("repository")
        if repo_data:
            repository = repo_data.get("full_name", "")

        event_id = await self._repo.store_event(
            delivery_id=delivery_id,
            event_type=event_type,
            action=action,
            repository=repository,
            payload=json.dumps(payload),
        )

        # Route by event type
        if event_type == "installation" and action == "created":
            installation = payload.get("installation", {})
            account = installation.get("account", {})
            await self._repo.store_installation(
                installation_id=installation.get("id", 0),
                account_login=account.get("login", ""),
                account_type=account.get("type", "User"),
            )
            return None, event_id

        if event_type == "issue_comment" and action == "created":
            return await self._handle_issue_comment(payload, event_id), event_id

        if event_type == "pull_request_review_comment" and action == "created":
            return await self._handle_pr_review_comment(payload, event_id), event_id

        return None, event_id

    async def update_event_box_id(self, event_id: str, box_id: str) -> None:
        """Link a webhook event to the box it created. Call after box creation."""
        await self._repo.update_event_box_id(event_id, box_id)

    async def _handle_issue_comment(self, payload: dict, event_id: str) -> BoxCreateRequest | None:  # noqa: ARG002
        comment = payload.get("comment", {})
        body = comment.get("body", "")
        user = comment.get("user", {})

        if user.get("type") == "Bot" or user.get("login", "").endswith("[bot]"):
            return None

        mention = f"@{self._api.bot_name}"
        if mention not in body:
            return None

        idx = body.index(mention) + len(mention)
        instruction = body[idx:].strip()

        issue = payload.get("issue", {})
        repository = payload.get("repository", {})
        repo_full_name = repository.get("full_name", "")
        issue_number = issue.get("number", 0)
        issue_title = issue.get("title", "")
        issue_body = issue.get("body", "")
        comment_url = comment.get("html_url", "")

        if not instruction:
            instruction = issue_body or issue_title

        installation = payload.get("installation", {})
        gh_installation_id = installation.get("id")
        if not gh_installation_id:
            logger.warning("No installation ID in webhook payload for %s", repo_full_name)
            return None

        db_installation = await self._repo.get_installation_by_github_id(gh_installation_id)
        if db_installation is None:
            account = installation.get("account", installation)
            db_installation = await self._repo.store_installation(
                installation_id=gh_installation_id,
                account_login=account.get("login", ""),
                account_type=account.get("type", "User"),
            )

        is_pr = "pull_request" in issue
        context = await self._api.extract_issue_context(
            gh_installation_id,
            repo_full_name,
            issue_number,
            is_pull_request=is_pr,
        )

        branch = self.generate_branch_name(issue_number, issue_title)
        base_branch = repository.get("default_branch", GITHUB_DEFAULT_BASE_BRANCH)

        prompt = self.build_prompt(
            instruction=instruction,
            repo=repo_full_name,
            branch=branch,
            base_branch=base_branch,
            issue_number=issue_number,
            issue_title=issue_title,
            issue_body=issue_body,
            conversation=context.get("comments", []),
            guidelines=context.get("guidelines", ""),
            changed_files=context.get("changed_files"),
            review_comments=context.get("review_comments"),
        )

        dynamic_system_prompt = self._default_dynamic_system_prompt()

        # Post reaction
        try:
            await self._api.post_reaction(
                gh_installation_id, repo_full_name, comment["id"], "rocket"
            )
        except Exception:
            logger.warning("Failed to post reaction on comment", exc_info=True)

        return BoxCreateRequest(
            name=f"[GitHub] #{issue_number}: {issue_title[:100]}",
            initial_prompt=prompt,
            dynamic_system_prompt=dynamic_system_prompt,
            trigger="github_issue",
            trigger_url=comment_url,
            integration_id=db_installation.id,
            repo=repo_full_name,
            branch=branch,
            issue_number=issue_number,
        )

    async def _handle_pr_review_comment(
        self,
        payload: dict,
        event_id: str,  # noqa: ARG002
    ) -> BoxCreateRequest | None:
        comment = payload.get("comment", {})
        body = comment.get("body", "")
        user = comment.get("user", {})

        if user.get("type") == "Bot" or user.get("login", "").endswith("[bot]"):
            return None

        mention = f"@{self._api.bot_name}"
        if mention not in body:
            return None

        idx = body.index(mention) + len(mention)
        instruction = body[idx:].strip()

        pull_request = payload.get("pull_request", {})
        repository = payload.get("repository", {})
        repo_full_name = repository.get("full_name", "")
        pr_number = pull_request.get("number", 0)
        pr_title = pull_request.get("title", "")
        pr_body = pull_request.get("body", "")
        comment_url = comment.get("html_url", "")
        pr_branch = pull_request.get("head", {}).get("ref", "")
        base_branch = pull_request.get("base", {}).get("ref", GITHUB_DEFAULT_BASE_BRANCH)

        if not instruction:
            instruction = f"Address the review comment on PR #{pr_number}"

        installation = payload.get("installation", {})
        gh_installation_id = installation.get("id")
        if not gh_installation_id:
            return None

        db_installation = await self._repo.get_installation_by_github_id(gh_installation_id)
        if db_installation is None:
            account = installation.get("account", installation)
            db_installation = await self._repo.store_installation(
                installation_id=gh_installation_id,
                account_login=account.get("login", ""),
                account_type=account.get("type", "User"),
            )

        context = await self._api.extract_issue_context(
            gh_installation_id,
            repo_full_name,
            pr_number,
            is_pull_request=True,
        )

        prompt = self.build_prompt(
            instruction=instruction,
            repo=repo_full_name,
            branch=pr_branch,
            base_branch=base_branch,
            issue_number=pr_number,
            issue_title=pr_title,
            issue_body=pr_body,
            conversation=context.get("comments", []),
            guidelines=context.get("guidelines", ""),
            changed_files=context.get("changed_files"),
            review_comments=context.get("review_comments"),
        )

        dynamic_system_prompt = self._default_dynamic_system_prompt()

        return BoxCreateRequest(
            name=f"[GitHub PR] #{pr_number}: {pr_title[:100]}",
            initial_prompt=prompt,
            dynamic_system_prompt=dynamic_system_prompt,
            trigger="github_pr",
            trigger_url=comment_url,
            integration_id=db_installation.id,
            repo=repo_full_name,
            branch=pr_branch,
            issue_number=pr_number,
        )

    def build_prompt(
        self,
        instruction: str,
        repo: str,
        branch: str,
        base_branch: str,
        issue_number: int,
        issue_title: str,
        issue_body: str,
        conversation: list[dict],
        guidelines: str,
        changed_files: list[str] | None = None,
        review_comments: list[dict] | None = None,
    ) -> str:
        """Assemble the agent prompt from extracted context."""
        parts = [
            f"You are working on repository {repo}.",
            f"You are on branch {branch}, created from {base_branch}.",
            "",
            "## Task",
            instruction,
            "",
            "## Issue Context",
            f"Title: {issue_title}",
            f"Body:\n{issue_body}" if issue_body else "",
        ]

        if conversation:
            parts.append("")
            parts.append("## Conversation")
            for c in conversation:
                parts.append(f"**{c['user']}** ({c.get('created_at', '')}):")
                parts.append(c["body"])
                parts.append("")

        if changed_files:
            parts.append("")
            parts.append("## Changed Files")
            parts.extend(changed_files)

        if review_comments:
            parts.append("")
            parts.append("## Review Comments")
            for c in review_comments:
                path = f" on `{c['path']}`" if c.get("path") else ""
                parts.append(f"**{c['user']}**{path} ({c.get('created_at', '')}):")
                parts.append(c["body"])
                parts.append("")

        if guidelines:
            parts.append("")
            parts.append("## Repository Guidelines")
            parts.append(guidelines)

        parts.extend(
            [
                "",
                "## Instructions",
                f"- The repository is cloned into /workspace (your CWD)"
                f" and you are on branch {branch}",
                "- Full issue context is also available at /app/codebox/context.md",
                "- Implement the requested changes",
                "- Write tests if applicable",
                "- Commit your changes with descriptive messages",
                "- Push your branch and open a pull request using `gh pr create`",
                f"- Reference issue #{issue_number} in the PR description",
            ]
        )

        return "\n".join(parts)

    def build_setup_commands(
        self,
        repo: str,
        branch: str,
        token: str,
        issue_number: int | None = None,
    ) -> list[str]:
        """Generate shell commands to set up the sandbox workspace for a GitHub task."""
        from codebox_orchestrator.integration.github.application.setup_commands import (  # noqa: PLC0415
            build_setup_commands,
        )

        return build_setup_commands(
            repo=repo,
            branch=branch,
            token=token,
            issue_number=issue_number,
        )

    @staticmethod
    def generate_branch_name(issue_number: int | None, title: str | None) -> str:
        """Generate a codebox/* branch name from issue context."""
        if issue_number and title:
            slug = re.sub(r"[^a-z0-9]+", "-", title.lower())[:40].strip("-")
            return f"codebox/{issue_number}-{slug}"
        return f"codebox/{uuid.uuid4().hex[:8]}"

    @staticmethod
    def _default_dynamic_system_prompt() -> str:
        return (
            "GH_TOKEN is set — use it for GitHub API access via git push and gh CLI.\n"
            "Commit your changes to a new branch and create a pull request using gh pr create."
        )
