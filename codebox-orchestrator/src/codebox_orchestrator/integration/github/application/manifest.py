"""GitHub App manifest helpers.

Centralizes the manifest JSON shape so the prepare endpoint and any
tests produce identical payloads for the same inputs.

See https://docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-from-a-manifest
for the authoritative parameter list.
"""

from __future__ import annotations

import secrets


def default_app_name(project_slug: str) -> str:
    """Suggest a GitHub App name for *project_slug*.

    GitHub App names are globally unique, so we append a short random
    suffix. Users can still edit the name on GitHub's confirmation page
    before clicking Create.
    """
    suffix = secrets.token_hex(3)  # 6 hex chars
    return f"codebox-{project_slug}-{suffix}"


def build_manifest(
    *,
    public_url: str,
    project_slug: str,
    app_name: str,
) -> dict:
    """Build the GitHub App manifest JSON for *project_slug*.

    ``public_url`` must be a publicly reachable URL (GitHub uses it for
    webhooks and for the OAuth-style redirect after registration).
    """
    base = public_url.rstrip("/")
    webhook_url = f"{base}/api/projects/{project_slug}/github/webhook"
    install_callback_url = f"{base}/api/projects/{project_slug}/github/callback"
    redirect_url = f"{base}/api/projects/{project_slug}/github/manifest/callback"
    return {
        "name": app_name,
        "url": f"{base}/projects/{project_slug}",
        "description": f"Codebox agent for project {project_slug}",
        "public": False,
        "hook_attributes": {"url": webhook_url, "active": True},
        "redirect_url": redirect_url,
        "callback_urls": [install_callback_url],
        "setup_url": install_callback_url,
        "setup_on_update": True,
        "request_oauth_on_install": False,
        "default_permissions": {
            "contents": "write",
            "pull_requests": "write",
            "issues": "write",
            "statuses": "write",
            "metadata": "read",
        },
        "default_events": [
            "issues",
            "issue_comment",
            "pull_request",
            "pull_request_review",
            "pull_request_review_comment",
            "push",
        ],
    }


def manifest_post_url(owner_type: str, owner_name: str | None) -> str:
    """Return the ``action`` URL for the manifest POST form.

    ``owner_type`` is ``"user"`` or ``"organization"``. For organizations,
    ``owner_name`` is required.
    """
    if owner_type == "organization":
        if not owner_name:
            msg = "owner_name is required when owner_type is 'organization'"
            raise ValueError(msg)
        # GitHub allows letters, numbers, and hyphens in org names.
        # We don't need to URL-encode — invalid chars would be rejected by GitHub anyway.
        return f"https://github.com/organizations/{owner_name}/settings/apps/new"
    if owner_type == "user":
        return "https://github.com/settings/apps/new"
    msg = f"Invalid owner_type: {owner_type!r} (expected 'user' or 'organization')"
    raise ValueError(msg)
