"""GitHub App integration API routes.

Handles webhook reception, installation callback, and installation management.
"""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse, RedirectResponse

from codebox_orchestrator.config import GITHUB_APP_SLUG, github_enabled
from codebox_orchestrator.schemas import (
    GitHubInstallationCreate,
    GitHubInstallationResponse,
    GitHubRepoResponse,
    GitHubStatusResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/github", tags=["github"])


def _require_github_service(request: Request):
    """Get the GitHubService from app state, raising 503 if not configured."""
    svc = getattr(request.app.state, "github_service", None)
    if svc is None:
        raise HTTPException(status_code=503, detail="GitHub integration not configured")
    return svc


@router.get("/status")
async def github_status() -> GitHubStatusResponse:
    """Return whether GitHub integration is configured."""
    return GitHubStatusResponse(enabled=github_enabled(), app_slug=GITHUB_APP_SLUG)


@router.post("/webhook", response_model=None)
async def github_webhook(request: Request) -> JSONResponse:
    """Receive and process GitHub webhooks."""
    github_service = _require_github_service(request)

    # Read raw body for signature verification
    body = await request.body()
    signature = request.headers.get("X-Hub-Signature-256", "")
    event_type = request.headers.get("X-GitHub-Event", "")
    delivery_id = request.headers.get("X-GitHub-Delivery", "")

    if not signature or not github_service.verify_webhook_signature(body, signature):
        raise HTTPException(status_code=401, detail="Invalid signature")

    if not event_type or not delivery_id:
        raise HTTPException(status_code=400, detail="Missing event headers")

    payload = await request.json()

    # Process asynchronously — GitHub expects a fast 200 response
    box_service = request.app.state.box_service
    asyncio.create_task(
        _process_webhook_safe(github_service, event_type, delivery_id, payload, box_service)
    )

    return JSONResponse({"status": "accepted"}, status_code=200)


async def _process_webhook_safe(github_service, event_type, delivery_id, payload, box_service):
    """Wrapper to catch and log errors from async webhook processing."""
    try:
        await github_service.process_webhook(event_type, delivery_id, payload, box_service)
    except Exception:
        logger.exception("Error processing webhook %s (delivery %s)", event_type, delivery_id)


@router.get("/callback", response_model=None)
async def github_callback(request: Request) -> RedirectResponse:
    """Handle GitHub App installation callback redirect.

    GitHub redirects here after a user installs the app on their org/repos.
    We store the installation and redirect to the web UI settings page.
    """
    github_service = getattr(request.app.state, "github_service", None)
    installation_id_str = request.query_params.get("installation_id", "")

    if not installation_id_str:
        return RedirectResponse("/settings/github?error=missing_installation_id")

    installation_id = int(installation_id_str)

    if github_service:
        try:
            info = await github_service.fetch_installation_info(installation_id)
            account = info.get("account", {})
            await github_service.store_installation(
                installation_id=installation_id,
                account_login=account.get("login", ""),
                account_type=account.get("type", "User"),
            )
        except Exception:
            logger.exception("Failed to store installation %d from callback", installation_id)
            return RedirectResponse("/settings/github?error=failed_to_store")

    return RedirectResponse(f"/settings/github?installation_id={installation_id}")


@router.get("/installations")
async def list_installations(request: Request) -> list[GitHubInstallationResponse]:
    """List all stored GitHub App installations."""
    github_service = getattr(request.app.state, "github_service", None)
    if github_service is None:
        return []
    installations = await github_service.list_installations()
    return [GitHubInstallationResponse.model_validate(i) for i in installations]


@router.post("/installations")
async def add_installation(
    request: Request, body: GitHubInstallationCreate
) -> GitHubInstallationResponse:
    """Manually add a GitHub App installation by installation ID."""
    github_service = _require_github_service(request)

    try:
        info = await github_service.fetch_installation_info(body.installation_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Failed to fetch installation info: {exc}")

    account = info.get("account", {})
    inst = await github_service.store_installation(
        installation_id=body.installation_id,
        account_login=account.get("login", ""),
        account_type=account.get("type", "User"),
    )
    return GitHubInstallationResponse.model_validate(inst)


@router.post("/installations/{id}/sync")
async def sync_installation(request: Request, id: str) -> list[GitHubRepoResponse]:
    """Re-fetch the repo list for an installation from the GitHub API."""
    github_service = _require_github_service(request)

    inst = await github_service.get_installation(id)
    if inst is None:
        raise HTTPException(status_code=404, detail="Installation not found")

    repos = await github_service.sync_installation_repos(inst.installation_id)
    return [GitHubRepoResponse(**r) for r in repos]


@router.delete("/installations/{id}", response_model=None)
async def remove_installation(request: Request, id: str) -> JSONResponse:
    """Remove an installation record (does not uninstall the app from GitHub)."""
    github_service = _require_github_service(request)

    deleted = await github_service.delete_installation(id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Installation not found")
    return JSONResponse({"status": "deleted"})


@router.get("/repos")
async def list_repos(request: Request) -> list[GitHubRepoResponse]:
    """List repos across all installations."""
    github_service = _require_github_service(request)

    installations = await github_service.list_installations()
    all_repos: list[GitHubRepoResponse] = []
    for inst in installations:
        try:
            repos = await github_service.sync_installation_repos(inst.installation_id)
            all_repos.extend(GitHubRepoResponse(**r) for r in repos)
        except Exception:
            logger.warning("Failed to fetch repos for installation %d", inst.installation_id)
    return all_repos
