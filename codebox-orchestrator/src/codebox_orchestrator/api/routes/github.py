"""GitHub App integration API routes (per-user scoped).

Each user configures their own GitHub App credentials via user settings.
Webhooks arrive at ``/api/github/webhook/{user_id}`` for per-user routing.
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import logging
from typing import TYPE_CHECKING

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, RedirectResponse

from codebox_orchestrator.api.dependencies import (
    get_create_box,
    get_github_client_manager,
    get_llm_profile_service,
    get_user_settings_service,
)
from codebox_orchestrator.api.schemas import (
    GitHubInstallationCreate,
    GitHubInstallationResponse,
    GitHubRepoResponse,
    GitHubStatusResponse,
)
from codebox_orchestrator.auth.dependencies import UserInfo, get_current_user

if TYPE_CHECKING:
    from codebox_orchestrator.box.application.commands.create_box import CreateBoxHandler
    from codebox_orchestrator.integration.github.application.client_manager import (
        GitHubClientManager,
    )
    from codebox_orchestrator.llm_profile.service import LLMProfileService
    from codebox_orchestrator.user_settings.service import UserSettingsService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/github", tags=["github"])

# Prevent background tasks from being garbage collected
_background_tasks: set[asyncio.Task] = set()


# ── Status ───────────────────────────────────────────────────────


@router.get("/status")
async def github_status(
    user: UserInfo = Depends(get_current_user),
    settings_service: UserSettingsService = Depends(get_user_settings_service),
) -> GitHubStatusResponse:
    """Return whether GitHub integration is configured for the current user."""
    settings = await settings_service.get_raw(user.user_id)
    enabled = settings_service.github_configured(settings)
    app_slug = settings.github_app_slug if settings else None
    webhook_url = f"/api/github/webhook/{user.user_id}" if enabled else None
    return GitHubStatusResponse(enabled=enabled, app_slug=app_slug, webhook_url=webhook_url)


# ── Webhook (per-user URL, no JWT auth — verified by HMAC) ──────


@router.post("/webhook/{user_id}", response_model=None)
async def github_webhook(
    user_id: str,
    request: Request,
    github_mgr: GitHubClientManager = Depends(get_github_client_manager),
    create_box_handler: CreateBoxHandler = Depends(get_create_box),
    profile_service: LLMProfileService = Depends(get_llm_profile_service),
    settings_service: UserSettingsService = Depends(get_user_settings_service),
) -> JSONResponse:
    """Receive and process GitHub webhooks for a specific user."""
    body = await request.body()
    signature = request.headers.get("X-Hub-Signature-256", "")
    event_type = request.headers.get("X-GitHub-Event", "")
    delivery_id = request.headers.get("X-GitHub-Delivery", "")

    if not signature or not event_type or not delivery_id:
        raise HTTPException(400, "Missing required webhook headers")

    # Resolve user's GitHub config and verify HMAC
    client, webhook_secret = await github_mgr.get_client_for_webhook(user_id)
    if client is None or webhook_secret is None:
        raise HTTPException(404, "GitHub integration not configured for this user")

    if not _verify_hmac(body, signature, webhook_secret):
        raise HTTPException(401, "Invalid signature")

    payload = await request.json()

    # Process asynchronously — GitHub expects a fast 200 response
    task = asyncio.create_task(
        _process_webhook_safe(
            user_id=user_id,
            event_type=event_type,
            delivery_id=delivery_id,
            payload=payload,
            github_mgr=github_mgr,
            create_box_handler=create_box_handler,
            profile_service=profile_service,
            settings_service=settings_service,
        )
    )
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)

    return JSONResponse({"status": "accepted"}, status_code=200)


def _verify_hmac(payload: bytes, signature: str, secret: str) -> bool:
    if not signature.startswith("sha256="):
        return False
    expected = hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(f"sha256={expected}", signature)


async def _process_webhook_safe(
    *,
    user_id: str,
    event_type: str,
    delivery_id: str,
    payload: dict,
    github_mgr: GitHubClientManager,
    create_box_handler: CreateBoxHandler,
    profile_service: LLMProfileService,
    settings_service: UserSettingsService,
) -> None:
    """Process webhook asynchronously: build handler, resolve LLM profile, create box."""
    from codebox_orchestrator.integration.github.application.webhook_handler import (  # noqa: PLC0415
        GitHubWebhookHandler,
    )

    try:
        client = await github_mgr.get_client(user_id)
        if client is None:
            logger.error(
                "GitHub client unavailable for user %s during webhook processing",
                user_id,
            )
            return

        # Build a per-user webhook handler
        settings = await settings_service.get_raw(user_id)
        default_branch = (
            settings.github_default_base_branch
            if settings and settings.github_default_base_branch
            else "main"
        )

        # Access the github_repo from the client manager
        handler = GitHubWebhookHandler(
            api_client=client,
            repo=github_mgr._github_repo,  # noqa: SLF001
            user_id=user_id,
            default_base_branch=default_branch,
        )

        box_req, event_id = await handler.process_webhook(event_type, delivery_id, payload)
        if box_req is not None:
            # Resolve user's default LLM profile for the box
            default_profile_id = await settings_service.get_default_profile_id(user_id)
            if not default_profile_id:
                logger.error(
                    "User %s has no default LLM profile — cannot create GitHub-triggered box",
                    user_id,
                )
                return

            resolved = await profile_service.resolve_profile(default_profile_id, user_id)
            if resolved is None:
                logger.error(
                    "Default LLM profile %s not found for user %s",
                    default_profile_id,
                    user_id,
                )
                return

            tavily_key = await settings_service.get_tavily_api_key(user_id)

            view = await create_box_handler.execute(
                name=box_req.name,
                provider=resolved.provider,
                model=resolved.model,
                api_key=resolved.api_key,
                base_url=resolved.base_url,
                tavily_api_key=tavily_key,
                system_prompt=box_req.dynamic_system_prompt,
                auto_start_prompt=box_req.initial_prompt,
                trigger=box_req.trigger,
                github_installation_id=box_req.integration_id,
                github_repo=box_req.repo,
                github_issue_number=box_req.issue_number,
                github_trigger_url=box_req.trigger_url,
                github_branch=box_req.branch,
                user_id=user_id,
            )
            if event_id:
                await handler.update_event_box_id(event_id, view.id)
    except Exception:
        logger.exception("Error processing webhook %s (delivery %s)", event_type, delivery_id)


# ── Callback ─────────────────────────────────────────────────────


@router.get("/callback", response_model=None)
async def github_callback(
    request: Request,
    user: UserInfo = Depends(get_current_user),
    github_mgr: GitHubClientManager = Depends(get_github_client_manager),
) -> RedirectResponse:
    """Handle GitHub App installation callback redirect."""
    installation_id_str = request.query_params.get("installation_id", "")

    if not installation_id_str:
        return RedirectResponse("/settings/github?error=missing_installation_id")

    installation_id = int(installation_id_str)

    service = github_mgr.get_installation_service(user.user_id)
    if service:
        try:
            await service.fetch_and_store(installation_id)
        except Exception:
            logger.exception("Failed to store installation %d from callback", installation_id)
            return RedirectResponse("/settings/github?error=failed_to_store")

    return RedirectResponse(f"/settings/github?installation_id={installation_id}")


# ── Installations ────────────────────────────────────────────────


@router.get("/installations")
async def list_installations(
    user: UserInfo = Depends(get_current_user),
    github_mgr: GitHubClientManager = Depends(get_github_client_manager),
) -> list[GitHubInstallationResponse]:
    """List the current user's GitHub App installations."""
    await github_mgr.get_client(user.user_id)  # ensure client loaded
    service = github_mgr.get_installation_service(user.user_id)
    if service is None:
        return []
    installations = await service.list_installations()
    return [GitHubInstallationResponse.model_validate(i) for i in installations]


@router.post("/installations")
async def add_installation(
    body: GitHubInstallationCreate,
    user: UserInfo = Depends(get_current_user),
    github_mgr: GitHubClientManager = Depends(get_github_client_manager),
) -> GitHubInstallationResponse:
    """Manually add a GitHub App installation."""
    await github_mgr.get_client(user.user_id)
    service = github_mgr.get_installation_service(user.user_id)
    if service is None:
        raise HTTPException(400, "GitHub integration not configured in your settings")
    try:
        inst = await service.fetch_and_store(body.installation_id)
    except Exception as exc:
        raise HTTPException(400, f"Failed to fetch installation info: {exc}") from exc
    return GitHubInstallationResponse.model_validate(inst)


@router.post("/installations/{installation_id}/sync")
async def sync_installation(
    installation_id: str,
    user: UserInfo = Depends(get_current_user),
    github_mgr: GitHubClientManager = Depends(get_github_client_manager),
) -> list[GitHubRepoResponse]:
    """Re-fetch the repo list for an installation from the GitHub API."""
    await github_mgr.get_client(user.user_id)
    service = github_mgr.get_installation_service(user.user_id)
    if service is None:
        raise HTTPException(400, "GitHub integration not configured in your settings")
    inst = await service.get_installation(installation_id)
    if inst is None:
        raise HTTPException(404, "Installation not found")
    repos = await service.sync_repos(inst.installation_id)
    return [GitHubRepoResponse(**r) for r in repos]


@router.delete("/installations/{installation_id}", response_model=None)
async def remove_installation(
    installation_id: str,
    user: UserInfo = Depends(get_current_user),
    github_mgr: GitHubClientManager = Depends(get_github_client_manager),
) -> JSONResponse:
    """Remove an installation record."""
    await github_mgr.get_client(user.user_id)
    service = github_mgr.get_installation_service(user.user_id)
    if service is None:
        raise HTTPException(400, "GitHub integration not configured in your settings")
    deleted = await service.delete_installation(installation_id)
    if not deleted:
        raise HTTPException(404, "Installation not found")
    return JSONResponse({"status": "deleted"})


@router.get("/repos")
async def list_repos(
    user: UserInfo = Depends(get_current_user),
    github_mgr: GitHubClientManager = Depends(get_github_client_manager),
) -> list[GitHubRepoResponse]:
    """List repos across all of the current user's installations."""
    await github_mgr.get_client(user.user_id)
    service = github_mgr.get_installation_service(user.user_id)
    if service is None:
        return []
    installations = await service.list_installations()
    all_repos: list[GitHubRepoResponse] = []
    for inst in installations:
        try:
            repos = await service.sync_repos(inst.installation_id)
            all_repos.extend(GitHubRepoResponse(**r) for r in repos)
        except Exception:
            logger.warning("Failed to fetch repos for installation %d", inst.installation_id)
    return all_repos
