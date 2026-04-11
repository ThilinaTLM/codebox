"""GitHub App integration API routes (DDD version).

Handles webhook reception, installation callback, and installation management.
"""

from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, RedirectResponse

from codebox_orchestrator.api.dependencies import (
    get_create_box,
    get_installation_service,
    get_webhook_handler,
)
from codebox_orchestrator.api.schemas import (
    GitHubInstallationCreate,
    GitHubInstallationResponse,
    GitHubRepoResponse,
    GitHubStatusResponse,
)
from codebox_orchestrator.auth.dependencies import UserInfo, get_current_user
from codebox_orchestrator.config import GITHUB_APP_SLUG, github_enabled

if TYPE_CHECKING:
    from codebox_orchestrator.box.application.commands.create_box import CreateBoxHandler
    from codebox_orchestrator.integration.github.application.installation_service import (
        GitHubInstallationService,
    )
    from codebox_orchestrator.integration.github.application.webhook_handler import (
        GitHubWebhookHandler,
    )

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/github", tags=["github"])

# Prevent background tasks from being garbage collected
_background_tasks: set[asyncio.Task] = set()


def _require_webhook_handler(
    handler: GitHubWebhookHandler | None = Depends(get_webhook_handler),
) -> GitHubWebhookHandler:
    if handler is None:
        raise HTTPException(status_code=503, detail="GitHub integration not configured")
    return handler


def _require_installation_service(
    service: GitHubInstallationService | None = Depends(get_installation_service),
) -> GitHubInstallationService:
    if service is None:
        raise HTTPException(status_code=503, detail="GitHub integration not configured")
    return service


@router.get("/status")
async def github_status(
    _: UserInfo = Depends(get_current_user),
) -> GitHubStatusResponse:
    """Return whether GitHub integration is configured."""
    return GitHubStatusResponse(enabled=github_enabled(), app_slug=GITHUB_APP_SLUG)


@router.post("/webhook", response_model=None)
async def github_webhook(
    request: Request,
    webhook_handler: GitHubWebhookHandler = Depends(_require_webhook_handler),
    create_box_handler: CreateBoxHandler = Depends(get_create_box),
) -> JSONResponse:
    """Receive and process GitHub webhooks."""
    # Read raw body for signature verification
    body = await request.body()
    signature = request.headers.get("X-Hub-Signature-256", "")
    event_type = request.headers.get("X-GitHub-Event", "")
    delivery_id = request.headers.get("X-GitHub-Delivery", "")

    if not signature or not webhook_handler.verify_signature(body, signature):
        raise HTTPException(status_code=401, detail="Invalid signature")

    if not event_type or not delivery_id:
        raise HTTPException(status_code=400, detail="Missing event headers")

    payload = await request.json()

    # Process asynchronously — GitHub expects a fast 200 response
    task = asyncio.create_task(
        _process_webhook_safe(
            webhook_handler,
            event_type,
            delivery_id,
            payload,
            create_box_handler,
        )
    )
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)

    return JSONResponse({"status": "accepted"}, status_code=200)


async def _process_webhook_safe(
    webhook_handler: GitHubWebhookHandler,
    event_type: str,
    delivery_id: str,
    payload: dict,
    create_box_handler: CreateBoxHandler,
) -> None:
    """Wrapper to catch and log errors from async webhook processing."""
    try:
        box_req, event_id = await webhook_handler.process_webhook(event_type, delivery_id, payload)
        if box_req is not None:
            # CreateBoxHandler now starts the box internally
            view = await create_box_handler.execute(
                name=box_req.name,
                provider=box_req.provider,
                model=box_req.model,
                system_prompt=box_req.dynamic_system_prompt,
                auto_start_prompt=box_req.initial_prompt,
                trigger=box_req.trigger,
                github_installation_id=box_req.integration_id,
                github_repo=box_req.repo,
                github_issue_number=box_req.issue_number,
                github_trigger_url=box_req.trigger_url,
                github_branch=box_req.branch,
            )
            if event_id:
                await webhook_handler.update_event_box_id(event_id, view.id)
    except Exception:
        logger.exception("Error processing webhook %s (delivery %s)", event_type, delivery_id)


@router.get("/callback", response_model=None)
async def github_callback(
    request: Request,
    service: GitHubInstallationService | None = Depends(get_installation_service),
) -> RedirectResponse:
    """Handle GitHub App installation callback redirect.

    GitHub redirects here after a user installs the app on their org/repos.
    We store the installation and redirect to the web UI settings page.
    """
    installation_id_str = request.query_params.get("installation_id", "")

    if not installation_id_str:
        return RedirectResponse("/settings/github?error=missing_installation_id")

    installation_id = int(installation_id_str)

    if service:
        try:
            await service.fetch_and_store(installation_id)
        except Exception:
            logger.exception("Failed to store installation %d from callback", installation_id)
            return RedirectResponse("/settings/github?error=failed_to_store")

    return RedirectResponse(f"/settings/github?installation_id={installation_id}")


@router.get("/installations")
async def list_installations(
    service: GitHubInstallationService | None = Depends(get_installation_service),
    _: UserInfo = Depends(get_current_user),
) -> list[GitHubInstallationResponse]:
    """List all stored GitHub App installations."""
    if service is None:
        return []
    installations = await service.list_installations()
    return [GitHubInstallationResponse.model_validate(i) for i in installations]


@router.post("/installations")
async def add_installation(
    body: GitHubInstallationCreate,
    service: GitHubInstallationService = Depends(_require_installation_service),
    _: UserInfo = Depends(get_current_user),
) -> GitHubInstallationResponse:
    """Manually add a GitHub App installation by installation ID."""
    try:
        inst = await service.fetch_and_store(body.installation_id)
    except Exception as exc:
        raise HTTPException(
            status_code=400, detail=f"Failed to fetch installation info: {exc}"
        ) from exc
    return GitHubInstallationResponse.model_validate(inst)


@router.post("/installations/{installation_id}/sync")
async def sync_installation(
    installation_id: str,
    service: GitHubInstallationService = Depends(_require_installation_service),
    _: UserInfo = Depends(get_current_user),
) -> list[GitHubRepoResponse]:
    """Re-fetch the repo list for an installation from the GitHub API."""
    inst = await service.get_installation(installation_id)
    if inst is None:
        raise HTTPException(status_code=404, detail="Installation not found")

    repos = await service.sync_repos(inst.installation_id)
    return [GitHubRepoResponse(**r) for r in repos]


@router.delete("/installations/{installation_id}", response_model=None)
async def remove_installation(
    installation_id: str,
    service: GitHubInstallationService = Depends(_require_installation_service),
    _: UserInfo = Depends(get_current_user),
) -> JSONResponse:
    """Remove an installation record (does not uninstall the app from GitHub)."""
    deleted = await service.delete_installation(installation_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Installation not found")
    return JSONResponse({"status": "deleted"})


@router.get("/repos")
async def list_repos(
    service: GitHubInstallationService = Depends(_require_installation_service),
    _: UserInfo = Depends(get_current_user),
) -> list[GitHubRepoResponse]:
    """List repos across all installations."""
    installations = await service.list_installations()
    all_repos: list[GitHubRepoResponse] = []
    for inst in installations:
        try:
            repos = await service.sync_repos(inst.installation_id)
            all_repos.extend(GitHubRepoResponse(**r) for r in repos)
        except Exception:
            logger.warning("Failed to fetch repos for installation %d", inst.installation_id)
    return all_repos
