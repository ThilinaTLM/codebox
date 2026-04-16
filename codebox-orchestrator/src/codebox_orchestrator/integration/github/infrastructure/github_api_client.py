"""GitHub API client -- handles all HTTP communication with GitHub."""

from __future__ import annotations

import hashlib
import hmac
import logging
import platform
import time
from datetime import datetime
from typing import TYPE_CHECKING

import httpx
import jwt

if TYPE_CHECKING:
    import ssl

if platform.system() == "Windows":
    import truststore

    _ssl_ctx: ssl.SSLContext | bool = truststore.SSLContext()
else:
    _ssl_ctx = True  # httpx default: use certifi

logger = logging.getLogger(__name__)

GITHUB_API_BASE = "https://api.github.com"
_JWT_EXPIRY_SECONDS = 600  # 10 minutes (GitHub maximum)
_TOKEN_REFRESH_MARGIN_SECONDS = 300  # Refresh when <5 min remaining


class GitHubApiClient:
    """Pure HTTP adapter for the GitHub API.  No database access."""

    def __init__(
        self,
        app_id: str,
        private_key: str,
        webhook_secret: bytes,
        app_slug: str,
        bot_name: str,
    ) -> None:
        self._app_id = app_id
        self._private_key = private_key
        self._webhook_secret = webhook_secret
        self._app_slug = app_slug
        self._bot_name = bot_name
        # Cache: GitHub installation_id (int) -> (token, expires_at_epoch)
        self._token_cache: dict[int, tuple[str, float]] = {}

    @property
    def bot_name(self) -> str:
        return self._bot_name

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
        expires_at = datetime.fromisoformat(expires_at_str).timestamp()
        self._token_cache[installation_id] = (token, expires_at)
        return token

    # ------------------------------------------------------------------
    # Manifest conversion (no app auth — staticmethod)
    # ------------------------------------------------------------------

    @staticmethod
    async def convert_manifest_code(code: str) -> dict:
        """Exchange a manifest ``code`` for GitHub App credentials.

        Calls ``POST /app-manifests/{code}/conversions``. The ``code`` is
        single-use and expires 1 hour after issuance. The response contains
        ``id``, ``slug``, ``name``, ``client_id``, ``client_secret``,
        ``webhook_secret``, ``pem``, ``html_url``, and more.
        """
        async with httpx.AsyncClient(verify=_ssl_ctx) as client:
            resp = await client.post(
                f"{GITHUB_API_BASE}/app-manifests/{code}/conversions",
                headers={
                    "Accept": "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28",
                },
            )
            resp.raise_for_status()
            return resp.json()

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

    # ------------------------------------------------------------------
    # Sync installation repos
    # ------------------------------------------------------------------

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
                repos.extend(
                    {
                        "full_name": repo["full_name"],
                        "private": repo["private"],
                        "default_branch": repo.get("default_branch", "main"),
                    }
                    for repo in data.get("repositories", [])
                )
                if len(data.get("repositories", [])) < 100:
                    break
                page += 1
        return repos

    # ------------------------------------------------------------------
    # Context extraction
    # ------------------------------------------------------------------

    async def extract_issue_context(
        self,
        installation_id: int,
        repo: str,
        issue_number: int,
        is_pull_request: bool = False,
    ) -> dict:
        """Fetch issue/PR details and conversation from the GitHub API."""
        token = await self.get_installation_token(installation_id)
        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }

        context: dict = {
            "comments": [],
            "guidelines": "",
            "changed_files": [],
            "review_comments": [],
        }

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
                    context["comments"].append(
                        {
                            "user": c.get("user", {}).get("login", ""),
                            "body": c.get("body", ""),
                            "created_at": c.get("created_at", ""),
                        }
                    )
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
                except Exception:  # noqa: S110
                    pass  # Optional file, ignore if not found

            # PR-specific context
            if is_pull_request:
                # Fetch changed files
                status_map = {
                    "added": "A",
                    "modified": "M",
                    "removed": "D",
                    "renamed": "R",
                    "copied": "C",
                }
                try:
                    resp = await client.get(
                        f"{GITHUB_API_BASE}/repos/{repo}/pulls/{issue_number}/files",
                        params={"per_page": 50},
                        headers=headers,
                    )
                    resp.raise_for_status()
                    for f in resp.json():
                        status = status_map.get(f.get("status", ""), "?")
                        filename = f.get("filename", "")
                        adds = f.get("additions", 0)
                        dels = f.get("deletions", 0)
                        context["changed_files"].append(f"{status} {filename} (+{adds}, -{dels})")
                except Exception:
                    logger.warning("Failed to fetch PR files", exc_info=True)

                # Fetch review comments
                try:
                    resp = await client.get(
                        f"{GITHUB_API_BASE}/repos/{repo}/pulls/{issue_number}/comments",
                        params={"per_page": 50},
                        headers=headers,
                    )
                    resp.raise_for_status()
                    for c in resp.json():
                        context["review_comments"].append(
                            {
                                "user": c.get("user", {}).get("login", ""),
                                "body": c.get("body", ""),
                                "path": c.get("path", ""),
                                "created_at": c.get("created_at", ""),
                            }
                        )
                except Exception:
                    logger.warning("Failed to fetch PR review comments", exc_info=True)

        return context

    # ------------------------------------------------------------------
    # Reactions
    # ------------------------------------------------------------------

    async def post_reaction(
        self, installation_id: int, repo: str, comment_id: int, reaction: str
    ) -> None:
        """Post an emoji reaction on an issue comment."""
        try:
            token = await self.get_installation_token(installation_id)
            async with httpx.AsyncClient(verify=_ssl_ctx) as client:
                await client.post(
                    f"{GITHUB_API_BASE}/repos/{repo}/issues/comments/{comment_id}/reactions",
                    json={"content": reaction},
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Accept": "application/vnd.github+json",
                        "X-GitHub-Api-Version": "2022-11-28",
                    },
                )
        except Exception:
            logger.warning("Failed to post reaction on comment", exc_info=True)
