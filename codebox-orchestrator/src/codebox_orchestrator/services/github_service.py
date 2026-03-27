"""GitHub App integration service.

Handles JWT generation, installation token management, webhook processing,
context extraction, prompt assembly, and setup command generation.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import re
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

import platform
import ssl

import httpx
import jwt

if platform.system() == "Windows":
    import truststore
    _ssl_ctx: ssl.SSLContext | bool = truststore.SSLContext()
else:
    _ssl_ctx = True  # httpx default: use certifi

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from codebox_orchestrator.config import GITHUB_DEFAULT_BASE_BRANCH
from codebox_orchestrator.db.models import GitHubEvent, GitHubInstallation

logger = logging.getLogger(__name__)

GITHUB_API_BASE = "https://api.github.com"
_JWT_EXPIRY_SECONDS = 600  # 10 minutes (GitHub maximum)
_TOKEN_REFRESH_MARGIN_SECONDS = 300  # Refresh when <5 min remaining


class GitHubService:
    """Core GitHub App integration logic."""

    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        app_id: str,
        private_key_path: str,
        webhook_secret: str,
        app_slug: str,
        bot_name: str,
    ) -> None:
        self._sf = session_factory
        self._app_id = app_id
        self._private_key = Path(private_key_path).read_text()
        self._webhook_secret = webhook_secret.encode()
        self._app_slug = app_slug
        self._bot_name = bot_name
        # Cache: GitHub installation_id (int) → (token, expires_at_epoch)
        self._token_cache: dict[int, tuple[str, float]] = {}

    # ------------------------------------------------------------------
    # JWT generation
    # ------------------------------------------------------------------

    def _generate_jwt(self) -> str:
        """Generate a JWT for GitHub App authentication (10-min expiry)."""
        now = int(time.time())
        payload = {
            "iss": self._app_id,
            "iat": now - 60,  # Allow clock skew
            "exp": now + _JWT_EXPIRY_SECONDS,
        }
        return jwt.encode(payload, self._private_key, algorithm="RS256")

    # ------------------------------------------------------------------
    # Installation token management
    # ------------------------------------------------------------------

    async def get_installation_token(self, installation_id: int) -> str:
        """Get or refresh an installation access token."""
        cached = self._token_cache.get(installation_id)
        if cached:
            token, expires_at = cached
            if time.time() < expires_at - _TOKEN_REFRESH_MARGIN_SECONDS:
                return token

        app_jwt = self._generate_jwt()
        async with httpx.AsyncClient(verify=_ssl_ctx) as client:
            resp = await client.post(
                f"{GITHUB_API_BASE}/app/installations/{installation_id}/access_tokens",
                headers={
                    "Authorization": f"Bearer {app_jwt}",
                    "Accept": "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28",
                },
            )
            resp.raise_for_status()
            data = resp.json()

        token = data["token"]
        expires_at_str = data["expires_at"]  # ISO 8601
        expires_at = datetime.fromisoformat(expires_at_str.replace("Z", "+00:00")).timestamp()
        self._token_cache[installation_id] = (token, expires_at)
        return token

    # ------------------------------------------------------------------
    # Webhook verification
    # ------------------------------------------------------------------

    def verify_webhook_signature(self, payload: bytes, signature: str) -> bool:
        """Verify X-Hub-Signature-256 header against the webhook secret."""
        if not signature.startswith("sha256="):
            return False
        expected = hmac.new(self._webhook_secret, payload, hashlib.sha256).hexdigest()
        return hmac.compare_digest(f"sha256={expected}", signature)

    # ------------------------------------------------------------------
    # Installation CRUD
    # ------------------------------------------------------------------

    async def store_installation(
        self, installation_id: int, account_login: str, account_type: str
    ) -> GitHubInstallation:
        """Store or update a GitHub App installation record."""
        async with self._sf() as db:
            stmt = select(GitHubInstallation).where(
                GitHubInstallation.installation_id == installation_id
            )
            result = await db.execute(stmt)
            existing = result.scalar_one_or_none()
            if existing:
                existing.account_login = account_login
                existing.account_type = account_type
                await db.commit()
                await db.refresh(existing)
                return existing

            inst = GitHubInstallation(
                installation_id=installation_id,
                account_login=account_login,
                account_type=account_type,
            )
            db.add(inst)
            await db.commit()
            await db.refresh(inst)
            return inst

    async def list_installations(self) -> list[GitHubInstallation]:
        async with self._sf() as db:
            stmt = select(GitHubInstallation).order_by(GitHubInstallation.created_at.desc())
            result = await db.execute(stmt)
            return list(result.scalars().all())

    async def get_installation(self, id: str) -> GitHubInstallation | None:
        async with self._sf() as db:
            return await db.get(GitHubInstallation, id)

    async def get_installation_by_github_id(
        self, installation_id: int
    ) -> GitHubInstallation | None:
        async with self._sf() as db:
            stmt = select(GitHubInstallation).where(
                GitHubInstallation.installation_id == installation_id
            )
            result = await db.execute(stmt)
            return result.scalar_one_or_none()

    async def delete_installation(self, id: str) -> bool:
        async with self._sf() as db:
            inst = await db.get(GitHubInstallation, id)
            if inst is None:
                return False
            await db.delete(inst)
            await db.commit()
            return True

    async def sync_installation_repos(self, installation_id: int) -> list[dict]:
        """Fetch repos accessible to an installation from the GitHub API."""
        token = await self.get_installation_token(installation_id)
        repos: list[dict] = []
        page = 1
        async with httpx.AsyncClient(verify=_ssl_ctx) as client:
            while True:
                resp = await client.get(
                    f"{GITHUB_API_BASE}/installation/repositories",
                    params={"per_page": 100, "page": page},
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Accept": "application/vnd.github+json",
                        "X-GitHub-Api-Version": "2022-11-28",
                    },
                )
                resp.raise_for_status()
                data = resp.json()
                for repo in data.get("repositories", []):
                    repos.append({
                        "full_name": repo["full_name"],
                        "private": repo["private"],
                        "default_branch": repo.get("default_branch", "main"),
                    })
                if len(data.get("repositories", [])) < 100:
                    break
                page += 1
        return repos

    # ------------------------------------------------------------------
    # Webhook processing
    # ------------------------------------------------------------------

    async def process_webhook(
        self,
        event_type: str,
        delivery_id: str,
        payload: dict,
        box_service: object,
    ) -> str | None:
        """Process a GitHub webhook payload.

        Returns the box_id if a box was created, else None.
        """
        # Dedup check
        async with self._sf() as db:
            stmt = select(GitHubEvent).where(GitHubEvent.delivery_id == delivery_id)
            result = await db.execute(stmt)
            if result.scalar_one_or_none() is not None:
                logger.info("Duplicate webhook delivery %s, skipping", delivery_id)
                return None

        # Store the event
        action = payload.get("action", "")
        repository = ""
        repo_data = payload.get("repository")
        if repo_data:
            repository = repo_data.get("full_name", "")

        async with self._sf() as db:
            event = GitHubEvent(
                delivery_id=delivery_id,
                event_type=event_type,
                action=action,
                repository=repository,
                payload=json.dumps(payload),
            )
            db.add(event)
            await db.commit()
            event_id = event.id

        # Route by event type
        if event_type == "installation" and action == "created":
            installation = payload.get("installation", {})
            account = installation.get("account", {})
            await self.store_installation(
                installation_id=installation.get("id", 0),
                account_login=account.get("login", ""),
                account_type=account.get("type", "User"),
            )
            return None

        if event_type == "issue_comment" and action == "created":
            return await self._handle_issue_comment(payload, event_id, box_service)

        if event_type == "pull_request_review_comment" and action == "created":
            return await self._handle_pr_review_comment(payload, event_id, box_service)

        return None

    async def _handle_issue_comment(
        self, payload: dict, event_id: str, box_service: object
    ) -> str | None:
        """Handle an issue_comment.created event."""
        comment = payload.get("comment", {})
        body = comment.get("body", "")
        user = comment.get("user", {})

        # Ignore bot comments
        if user.get("type") == "Bot" or user.get("login", "").endswith("[bot]"):
            return None

        # Check for trigger mention
        mention = f"@{self._bot_name}"
        if mention not in body:
            return None

        # Extract instruction (text after the mention)
        idx = body.index(mention) + len(mention)
        instruction = body[idx:].strip()

        issue = payload.get("issue", {})
        repository = payload.get("repository", {})
        repo_full_name = repository.get("full_name", "")
        issue_number = issue.get("number", 0)
        issue_title = issue.get("title", "")
        issue_body = issue.get("body", "")
        comment_url = comment.get("html_url", "")

        # If no instruction after mention, use the issue body
        if not instruction:
            instruction = issue_body or issue_title

        # Find installation for this repo
        installation = payload.get("installation", {})
        gh_installation_id = installation.get("id")
        if not gh_installation_id:
            logger.warning("No installation ID in webhook payload for %s", repo_full_name)
            return None

        db_installation = await self.get_installation_by_github_id(gh_installation_id)
        if db_installation is None:
            # Auto-store if not yet tracked
            account = installation.get("account", installation)
            db_installation = await self.store_installation(
                installation_id=gh_installation_id,
                account_login=account.get("login", ""),
                account_type=account.get("type", "User"),
            )

        # Fetch issue context
        context = await self._extract_issue_context(
            gh_installation_id, repo_full_name, issue_number
        )

        # Generate branch name
        branch = self.generate_branch_name(issue_number, issue_title)
        base_branch = repository.get("default_branch", GITHUB_DEFAULT_BASE_BRANCH)

        # Build prompt
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
        )

        # Build system prompt
        system_prompt = (
            "You are a coding agent running inside a sandboxed container. "
            "You have access to tools for filesystem operations "
            "(ls, read_file, write_file, edit_file, glob, grep), "
            "shell execution (execute), and web access "
            "(web_search, web_fetch). Use them to help with coding tasks.\n\n"
            "Environment:\n"
            "- Working directory: /workspace\n"
            "- Python 3.12, Node.js 20, Go 1.22 are pre-installed\n"
            "- git, gh CLI, ripgrep, jq, curl are available\n"
            "- GH_TOKEN is set for GitHub API access (git push and gh CLI)\n"
            "- You are inside a disposable sandbox."
        )

        # Create box
        from codebox_orchestrator.services.box_service import BoxService
        bs: BoxService = box_service  # type: ignore[assignment]
        box = await bs.create_box(
            name=f"[GitHub] #{issue_number}: {issue_title[:100]}",
            initial_prompt=prompt,
            system_prompt=system_prompt,

            trigger="github_issue",
            github_installation_id=db_installation.id,
            github_repo=repo_full_name,
            github_issue_number=issue_number,
            github_trigger_url=comment_url,
            github_branch=branch,
        )

        # Update event with box_id
        async with self._sf() as db:
            ev = await db.get(GitHubEvent, event_id)
            if ev:
                ev.box_id = box.id
                await db.commit()

        # Post a reaction on the triggering comment
        try:
            token = await self.get_installation_token(gh_installation_id)
            async with httpx.AsyncClient(verify=_ssl_ctx) as client:
                await client.post(
                    f"{GITHUB_API_BASE}/repos/{repo_full_name}/issues/comments/{comment['id']}/reactions",
                    json={"content": "rocket"},
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Accept": "application/vnd.github+json",
                        "X-GitHub-Api-Version": "2022-11-28",
                    },
                )
        except Exception:
            logger.warning("Failed to post reaction on comment", exc_info=True)

        logger.info(
            "Created box %s from issue comment on %s#%d",
            box.id, repo_full_name, issue_number,
        )
        return box.id

    async def _handle_pr_review_comment(
        self, payload: dict, event_id: str, box_service: object
    ) -> str | None:
        """Handle a pull_request_review_comment.created event."""
        comment = payload.get("comment", {})
        body = comment.get("body", "")
        user = comment.get("user", {})

        # Ignore bot comments
        if user.get("type") == "Bot" or user.get("login", "").endswith("[bot]"):
            return None

        mention = f"@{self._bot_name}"
        if mention not in body:
            return None

        # Extract instruction
        idx = body.index(mention) + len(mention)
        instruction = body[idx:].strip()

        pull_request = payload.get("pull_request", {})
        repository = payload.get("repository", {})
        repo_full_name = repository.get("full_name", "")
        pr_number = pull_request.get("number", 0)
        pr_title = pull_request.get("title", "")
        pr_body = pull_request.get("body", "")
        comment_url = comment.get("html_url", "")
        # Use the existing PR branch
        pr_branch = pull_request.get("head", {}).get("ref", "")
        base_branch = pull_request.get("base", {}).get("ref", GITHUB_DEFAULT_BASE_BRANCH)

        if not instruction:
            instruction = f"Address the review comment on PR #{pr_number}"

        # Find installation
        installation = payload.get("installation", {})
        gh_installation_id = installation.get("id")
        if not gh_installation_id:
            return None

        db_installation = await self.get_installation_by_github_id(gh_installation_id)
        if db_installation is None:
            account = installation.get("account", installation)
            db_installation = await self.store_installation(
                installation_id=gh_installation_id,
                account_login=account.get("login", ""),
                account_type=account.get("type", "User"),
            )

        prompt = self.build_prompt(
            instruction=instruction,
            repo=repo_full_name,
            branch=pr_branch,
            base_branch=base_branch,
            issue_number=pr_number,
            issue_title=pr_title,
            issue_body=pr_body,
            conversation=[],
            guidelines="",
        )

        system_prompt = (
            "You are a coding agent running inside a sandboxed container. "
            "You have access to tools for filesystem operations "
            "(ls, read_file, write_file, edit_file, glob, grep), "
            "shell execution (execute), and web access "
            "(web_search, web_fetch). Use them to help with coding tasks.\n\n"
            "Environment:\n"
            "- Working directory: /workspace\n"
            "- Python 3.12, Node.js 20, Go 1.22 are pre-installed\n"
            "- git, gh CLI, ripgrep, jq, curl are available\n"
            "- GH_TOKEN is set for GitHub API access (git push and gh CLI)\n"
            "- You are inside a disposable sandbox."
        )

        from codebox_orchestrator.services.box_service import BoxService
        bs: BoxService = box_service  # type: ignore[assignment]
        box = await bs.create_box(
            name=f"[GitHub PR] #{pr_number}: {pr_title[:100]}",
            initial_prompt=prompt,
            system_prompt=system_prompt,

            trigger="github_pr",
            github_installation_id=db_installation.id,
            github_repo=repo_full_name,
            github_issue_number=pr_number,
            github_trigger_url=comment_url,
            github_branch=pr_branch,
        )

        async with self._sf() as db:
            ev = await db.get(GitHubEvent, event_id)
            if ev:
                ev.box_id = box.id
                await db.commit()

        logger.info(
            "Created box %s from PR review comment on %s#%d",
            box.id, repo_full_name, pr_number,
        )
        return box.id

    # ------------------------------------------------------------------
    # Context extraction
    # ------------------------------------------------------------------

    async def _extract_issue_context(
        self, installation_id: int, repo: str, issue_number: int
    ) -> dict:
        """Fetch issue details and conversation from the GitHub API."""
        token = await self.get_installation_token(installation_id)
        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }

        context: dict = {"comments": [], "guidelines": ""}

        async with httpx.AsyncClient(verify=_ssl_ctx) as client:
            # Fetch comments
            try:
                resp = await client.get(
                    f"{GITHUB_API_BASE}/repos/{repo}/issues/{issue_number}/comments",
                    params={"per_page": 50},
                    headers=headers,
                )
                resp.raise_for_status()
                for c in resp.json():
                    context["comments"].append({
                        "user": c.get("user", {}).get("login", ""),
                        "body": c.get("body", ""),
                        "created_at": c.get("created_at", ""),
                    })
            except Exception:
                logger.warning("Failed to fetch issue comments", exc_info=True)

            # Try to fetch repo guidelines (CLAUDE.md, CONTRIBUTING.md)
            for filename in ("CLAUDE.md", "CONTRIBUTING.md"):
                try:
                    resp = await client.get(
                        f"{GITHUB_API_BASE}/repos/{repo}/contents/{filename}",
                        headers={**headers, "Accept": "application/vnd.github.raw+json"},
                    )
                    if resp.status_code == 200:
                        context["guidelines"] += f"\n\n## {filename}\n{resp.text}"
                except Exception:
                    pass

        return context

    # ------------------------------------------------------------------
    # Prompt assembly
    # ------------------------------------------------------------------

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

        if guidelines:
            parts.append("")
            parts.append("## Repository Guidelines")
            parts.append(guidelines)

        parts.extend([
            "",
            "## Instructions",
            f"- The repository is cloned into /workspace (your CWD) and you are on branch {branch}",
            f"- Full issue context is also available at /app/codebox/context.md",
            "- Implement the requested changes",
            "- Write tests if applicable",
            "- Commit your changes with descriptive messages",
            "- Push your branch and open a pull request using `gh pr create`",
            f"- Reference issue #{issue_number} in the PR description",
        ])

        return "\n".join(parts)

    # ------------------------------------------------------------------
    # Setup command generation
    # ------------------------------------------------------------------

    def build_setup_commands(
        self,
        repo: str,
        branch: str,
        token: str,
        issue_number: int | None = None,
    ) -> list[str]:
        """Generate shell commands to set up the sandbox workspace for a GitHub task."""
        context_lines = [
            f"Repository: {repo}",
            f"Branch: {branch}",
        ]
        if issue_number:
            context_lines.append(f"Issue: #{issue_number}")
        context_md = "\n".join(context_lines)

        pre_push_hook = (
            "#!/bin/bash\n"
            "while read local_ref local_sha remote_ref remote_sha; do\n"
            '    branch=$(echo "$remote_ref" | sed \'s|refs/heads/||\')\n'
            '    if [[ ! "$branch" =~ ^codebox/ ]]; then\n'
            '        echo "ERROR: Push rejected. Can only push to codebox/* branches."\n'
            '        echo "Attempted to push to: $branch"\n'
            "        exit 1\n"
            "    fi\n"
            "done\n"
            "exit 0"
        )

        commands = [
            # Configure git credentials globally so clone uses the token
            f'git config --global url."https://x-access-token:{token}@github.com/".insteadOf "https://github.com/"',
            # Mark /workspace as safe (mounted volume may have different ownership)
            "git config --global --add safe.directory /workspace",
            # Clone repo into /workspace
            f"git clone https://github.com/{repo}.git /workspace",
            # Create and check out the working branch
            f"cd /workspace && git checkout -b {branch}",
            # Configure git identity
            'cd /workspace && git config user.email "codebox[bot]@users.noreply.github.com"',
            'cd /workspace && git config user.name "codebox[bot]"',
            # Install pre-push safety hook
            f"cat > /workspace/.git/hooks/pre-push << 'HOOKEOF'\n{pre_push_hook}\nHOOKEOF",
            "chmod +x /workspace/.git/hooks/pre-push",
            # Write context file
            f"cat > /app/codebox/context.md << 'CTXEOF'\n{context_md}\nCTXEOF",
        ]

        return commands

    # ------------------------------------------------------------------
    # Branch naming
    # ------------------------------------------------------------------

    @staticmethod
    def generate_branch_name(issue_number: int | None, title: str | None) -> str:
        """Generate a codebox/* branch name from issue context."""
        if issue_number and title:
            slug = re.sub(r"[^a-z0-9]+", "-", title.lower())[:40].strip("-")
            return f"codebox/{issue_number}-{slug}"
        return f"codebox/{uuid.uuid4().hex[:8]}"

    # ------------------------------------------------------------------
    # Fetch installation info from GitHub API (for callback flow)
    # ------------------------------------------------------------------

    async def fetch_installation_info(self, installation_id: int) -> dict:
        """Fetch installation metadata from GitHub API."""
        app_jwt = self._generate_jwt()
        async with httpx.AsyncClient(verify=_ssl_ctx) as client:
            resp = await client.get(
                f"{GITHUB_API_BASE}/app/installations/{installation_id}",
                headers={
                    "Authorization": f"Bearer {app_jwt}",
                    "Accept": "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28",
                },
            )
            resp.raise_for_status()
            return resp.json()
