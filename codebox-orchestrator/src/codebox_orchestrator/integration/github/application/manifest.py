"""GitHub App manifest helpers.

Centralizes the manifest JSON shape so the prepare endpoint and any
tests produce identical payloads for the same inputs.

See https://docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-from-a-manifest
for the authoritative parameter list.
"""

from __future__ import annotations

import secrets

# The set of GitHub webhook event names the orchestrator subscribes to on
# App registration. This single source of truth is consumed by both
# ``build_manifest`` (App registration) and any future App-drift diagnostics.
#
# Not every event here has a matching ``trigger_kind`` in
# ``webhook_dispatcher.EVENT_TYPE_TO_TRIGGER_KIND`` yet — unrouted events
# are persisted but not fanned out to automations. Subscribing early keeps
# newly-installed apps ready for future trigger kinds without requiring
# operators to re-accept permission prompts.
#
# When you add a new trigger kind, add the matching GitHub event name here
# *and* the dispatcher mapping, *and* update the UI's GitHub configuration
# tab so operators can detect drift on existing installations.
REQUIRED_EVENTS: frozenset[str] = frozenset(
    {
        # Currently dispatched to trigger kinds
        "issues",
        "issue_comment",
        "pull_request",
        "pull_request_review",
        "pull_request_review_comment",
        "push",
        # Subscribed for future dispatcher support / observability
        "create",
        "delete",
        "release",
        "check_run",
        "check_suite",
        "status",
        "workflow_run",
        "workflow_job",
        "workflow_dispatch",
        "deployment",
        "deployment_status",
        "discussion",
        "discussion_comment",
        "repository",
    }
)


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
            # Code + git history (branches, commits, tags, releases)
            "contents": "write",
            # Commit/modify files under .github/workflows/**
            "workflows": "write",
            # Trigger / cancel / re-run workflow runs, download artifacts &
            # logs, manage caches. Does NOT grant Actions secrets access.
            "actions": "write",
            # Issues + PRs
            "issues": "write",
            "pull_requests": "write",
            # Commit statuses (legacy CI surfacing)
            "statuses": "write",
            # Modern check runs & suites
            "checks": "write",
            # Deployments & environments
            "deployments": "write",
            "environments": "write",
            # Required by GitHub; cannot be removed
            "metadata": "read",
            # Discussions
            "discussions": "write",
            # GitHub Pages
            "pages": "write",
            # Repo-level GitHub Projects (classic)
            "repository_projects": "write",
            # Packages attached to the repo (GHCR, npm, etc.)
            "packages": "write",
            # Manage repo webhooks
            "repository_hooks": "write",
        },
        "default_events": sorted(REQUIRED_EVENTS),
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
