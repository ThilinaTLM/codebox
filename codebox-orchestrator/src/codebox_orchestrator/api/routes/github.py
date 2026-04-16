"""GitHub App integration API routes (project-scoped).

Each project configures its own GitHub App credentials via project settings.
Webhooks arrive at ``/api/projects/{slug}/github/webhook`` for per-project routing.
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import logging
import secrets
import time
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel

from codebox_orchestrator.api.dependencies import (
    get_create_box,
    get_github_client_manager,
    get_github_repository,
    get_llm_profile_service,
    get_project_settings_service,
)
from codebox_orchestrator.api.schemas import (
    GitHubEventListResponse,
    GitHubEventResponse,
    GitHubInstallationCreate,
    GitHubInstallationResponse,
    GitHubRepoResponse,
    GitHubStatusResponse,
)
from codebox_orchestrator.integration.github.application.manifest import (
    build_manifest,
    default_app_name,
    manifest_post_url,
)
from codebox_orchestrator.integration.github.infrastructure.github_api_client import (
    GitHubApiClient,
)
from codebox_orchestrator.project.dependencies import (
    ProjectContext,
    get_project_context,
    require_project_admin,
)

if TYPE_CHECKING:
    from codebox_orchestrator.box.application.commands.create_box import CreateBoxHandler
    from codebox_orchestrator.integration.github.application.client_manager import (
        GitHubClientManager,
    )
    from codebox_orchestrator.integration.github.infrastructure.github_repository import (
        SqlAlchemyGitHubRepository,
    )
    from codebox_orchestrator.llm_profile.service import LLMProfileService
    from codebox_orchestrator.project_settings.service import ProjectSettingsService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/projects/{slug}/github", tags=["GitHub"])


def _encode_cursor(created_at: datetime, event_id: str) -> str:
    raw = f"{created_at.astimezone(UTC).isoformat()}|{event_id}"
    return base64.urlsafe_b64encode(raw.encode()).decode()


def _decode_cursor(cursor: str | None) -> tuple[datetime, str] | None:
    if not cursor:
        return None
    try:
        raw = base64.urlsafe_b64decode(cursor.encode()).decode()
        created_at_s, event_id = raw.split("|", 1)
        return datetime.fromisoformat(created_at_s), event_id
    except Exception:
        return None


# Prevent background tasks from being garbage collected
_background_tasks: set[asyncio.Task] = set()


# ── Status ───────────────────────────────────────────────────────


@router.get("/status")
async def github_status(
    ctx: ProjectContext = Depends(get_project_context),
    settings_service: ProjectSettingsService = Depends(get_project_settings_service),
) -> GitHubStatusResponse:
    """Return whether GitHub integration is configured for this project."""
    from codebox_orchestrator.config import settings as app_settings  # noqa: PLC0415

    settings = await settings_service.get_raw(ctx.project_id)
    enabled = settings_service.github_configured(settings)
    app_slug = settings.github_app_slug if settings else None
    public_url = app_settings.urls.public_url or None
    if public_url and enabled:
        webhook_url = f"{public_url.rstrip('/')}/api/projects/{ctx.project_slug}/github/webhook"
    elif enabled:
        webhook_url = f"/api/projects/{ctx.project_slug}/github/webhook"
    else:
        webhook_url = None
    return GitHubStatusResponse(
        enabled=enabled,
        app_slug=app_slug,
        webhook_url=webhook_url,
        public_url=public_url,
        manifest_supported=bool(public_url),
    )


@router.get("/events", summary="List GitHub webhook events", operation_id="list_github_events")
async def list_github_events(
    delivery_id: str | None = None,
    event_type: str | None = None,
    action: str | None = None,
    box_id: str | None = None,
    limit: int = 50,
    cursor: str | None = None,
    ctx: ProjectContext = Depends(get_project_context),
    github_repo: SqlAlchemyGitHubRepository = Depends(get_github_repository),
) -> GitHubEventListResponse:
    limit = max(1, min(limit, 200))
    cursor_tuple = _decode_cursor(cursor)
    events = await github_repo.list_events(
        project_id=ctx.project_id,
        delivery_id=delivery_id,
        event_type=event_type,
        action=action,
        box_id=box_id,
        limit=limit,
        cursor=cursor_tuple,
    )
    next_cursor = None
    if len(events) == limit:
        tail = events[-1]
        next_cursor = _encode_cursor(tail.created_at, tail.id)
    return GitHubEventListResponse(
        items=[
            GitHubEventResponse(
                id=event.id,
                delivery_id=event.delivery_id,
                event_type=event.event_type,
                action=event.action,
                repository=event.repository,
                box_id=event.box_id,
                created_at=event.created_at,
            )
            for event in events
        ],
        next_cursor=next_cursor,
    )


# ── Webhook (per-project URL, no JWT auth — verified by HMAC) ──


@router.post("/webhook", response_model=None)
async def github_webhook(
    slug: str,
    request: Request,
    github_mgr: GitHubClientManager = Depends(get_github_client_manager),
    create_box_handler: CreateBoxHandler = Depends(get_create_box),
    profile_service: LLMProfileService = Depends(get_llm_profile_service),
    settings_service: ProjectSettingsService = Depends(get_project_settings_service),
) -> JSONResponse:
    """Receive and process GitHub webhooks for a specific project."""
    body = await request.body()
    signature = request.headers.get("X-Hub-Signature-256", "")
    event_type = request.headers.get("X-GitHub-Event", "")
    delivery_id = request.headers.get("X-GitHub-Delivery", "")

    if not signature or not event_type or not delivery_id:
        raise HTTPException(400, "Missing required webhook headers")

    # Resolve project from slug
    from codebox_orchestrator.project.service import ProjectService  # noqa: PLC0415, TC001

    project_service: ProjectService = request.app.state.project_service
    project = await project_service.get_project_by_slug(slug)
    if project is None:
        raise HTTPException(404, "Project not found")

    project_id = project.id

    # Resolve project's GitHub config and verify HMAC
    client, webhook_secret = await github_mgr.get_client_for_webhook(project_id)
    if client is None or webhook_secret is None:
        raise HTTPException(404, "GitHub integration not configured for this project")

    if not _verify_hmac(body, signature, webhook_secret):
        raise HTTPException(401, "Invalid signature")

    payload = await request.json()

    # Process asynchronously — GitHub expects a fast 200 response
    task = asyncio.create_task(
        _process_webhook_safe(
            project_id=project_id,
            project_slug=slug,
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
    project_id: str,
    project_slug: str,
    event_type: str,
    delivery_id: str,
    payload: dict,
    github_mgr: GitHubClientManager,
    create_box_handler: CreateBoxHandler,
    profile_service: LLMProfileService,
    settings_service: ProjectSettingsService,
) -> None:
    """Process webhook asynchronously: build handler, resolve LLM profile, create box."""
    from codebox_orchestrator.integration.github.application.webhook_handler import (  # noqa: PLC0415
        GitHubWebhookHandler,
    )

    try:
        client = await github_mgr.get_client(project_id)
        if client is None:
            logger.error(
                "GitHub client unavailable for project %s during webhook processing",
                project_slug,
            )
            return

        # Build a per-project webhook handler
        settings = await settings_service.get_raw(project_id)
        default_branch = (
            settings.github_default_base_branch
            if settings and settings.github_default_base_branch
            else "main"
        )

        handler = GitHubWebhookHandler(
            api_client=client,
            repo=github_mgr._github_repo,  # noqa: SLF001
            project_id=project_id,
            default_base_branch=default_branch,
        )

        box_req, event_id = await handler.process_webhook(event_type, delivery_id, payload)
        if box_req is not None:
            # Resolve project's default LLM profile for the box
            default_profile_id = await settings_service.get_default_profile_id(project_id)
            if not default_profile_id:
                logger.error(
                    "Project %s has no default LLM profile — cannot create GitHub-triggered box",
                    project_slug,
                )
                return

            resolved = await profile_service.resolve_profile(default_profile_id, project_id)
            if resolved is None:
                logger.error(
                    "Default LLM profile %s not found for project %s",
                    default_profile_id,
                    project_slug,
                )
                return

            tavily_key = await settings_service.get_tavily_api_key(project_id)

            view = await create_box_handler.execute(
                name=box_req.name,
                provider=resolved.provider,
                model=resolved.model,
                api_key=resolved.api_key,
                base_url=resolved.base_url,
                tavily_api_key=tavily_key,
                system_prompt=box_req.system_prompt,
                auto_start_prompt=box_req.initial_prompt,
                trigger=box_req.trigger,
                github_installation_id=box_req.integration_id,
                github_repo=box_req.repo,
                github_issue_number=box_req.issue_number,
                github_trigger_url=box_req.trigger_url,
                github_branch=box_req.branch,
                project_id=project_id,
            )
            if event_id:
                await handler.update_event_box_id(event_id, view.id)
    except Exception:
        logger.exception("Error processing webhook %s (delivery %s)", event_type, delivery_id)


# ── Manifest flow ────────────────────────────────────────────────


_MANIFEST_STATE_TTL_SECONDS = 60 * 60  # GitHub gives us 1 hour to exchange the code


class GitHubManifestPrepareRequest(BaseModel):
    owner_type: str  # "user" | "organization"
    owner_name: str | None = None


class GitHubManifestPrepareResponse(BaseModel):
    action: str
    manifest: dict
    state: str


def _prune_manifest_states(store: dict[str, tuple[str, float]]) -> None:
    now = time.time()
    expired = [k for k, (_, exp) in store.items() if exp < now]
    for key in expired:
        store.pop(key, None)


@router.post("/manifest/prepare", response_model=GitHubManifestPrepareResponse)
async def prepare_github_manifest(
    body: GitHubManifestPrepareRequest,
    request: Request,
    ctx: ProjectContext = Depends(require_project_admin),
) -> GitHubManifestPrepareResponse:
    """Prepare a GitHub App manifest for the UI to POST to github.com.

    The UI must submit a real top-level HTML form POST — GitHub only
    accepts this flow as a browser navigation, not an XHR.
    """
    from codebox_orchestrator.config import settings as app_settings  # noqa: PLC0415

    public_url = app_settings.urls.public_url
    if not public_url:
        raise HTTPException(
            400,
            "CODEBOX_ORCHESTRATOR_PUBLIC_URL is not set on the orchestrator. "
            "Set it to a publicly reachable URL and restart the orchestrator, "
            "or use the manual credentials form instead.",
        )

    try:
        action = manifest_post_url(body.owner_type, body.owner_name)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    manifest = build_manifest(
        public_url=public_url,
        project_slug=ctx.project_slug,
        app_name=default_app_name(ctx.project_slug),
    )

    state_token = secrets.token_urlsafe(32)
    store: dict[str, tuple[str, float]] = request.app.state.github_manifest_states
    _prune_manifest_states(store)
    store[ctx.project_id] = (state_token, time.time() + _MANIFEST_STATE_TTL_SECONDS)

    return GitHubManifestPrepareResponse(
        action=action,
        manifest=manifest,
        state=state_token,
    )


@router.get("/manifest/callback", response_model=None)
async def github_manifest_callback(
    request: Request,
    ctx: ProjectContext = Depends(require_project_admin),
    github_mgr: GitHubClientManager = Depends(get_github_client_manager),
    settings_service: ProjectSettingsService = Depends(get_project_settings_service),
) -> RedirectResponse:
    """Handle GitHub's redirect after the user creates a GitHub App from our manifest.

    Exchanges the temporary ``code`` for the App's credentials and stores
    them in ``project_settings``.
    """
    code = request.query_params.get("code", "")
    state = request.query_params.get("state", "")
    redirect_base = f"/projects/{ctx.project_slug}/configs/github"

    if not code or not state:
        return RedirectResponse(f"{redirect_base}?manifest=error&reason=missing_params")

    store: dict[str, tuple[str, float]] = request.app.state.github_manifest_states
    _prune_manifest_states(store)
    saved = store.pop(ctx.project_id, None)
    if saved is None or saved[0] != state:
        return RedirectResponse(f"{redirect_base}?manifest=error&reason=invalid_state")

    try:
        data = await GitHubApiClient.convert_manifest_code(code)
    except Exception:
        logger.exception("Failed to convert manifest code for project %s", ctx.project_slug)
        return RedirectResponse(f"{redirect_base}?manifest=error&reason=exchange_failed")

    app_id = data.get("id")
    app_slug = data.get("slug") or ""
    pem = data.get("pem") or ""
    webhook_secret = data.get("webhook_secret") or ""
    if not app_id or not pem or not webhook_secret:
        logger.error("Manifest conversion returned incomplete data for %s", ctx.project_slug)
        return RedirectResponse(f"{redirect_base}?manifest=error&reason=incomplete_response")

    await settings_service.update_settings(
        ctx.project_id,
        github_app_id=str(app_id),
        github_app_slug=app_slug,
        github_bot_name=app_slug,
        github_private_key=pem,
        github_webhook_secret=webhook_secret,
    )
    github_mgr.invalidate(ctx.project_id)

    return RedirectResponse(f"{redirect_base}?manifest=ok")


# ── Callback ─────────────────────────────────────────────────────


@router.get("/callback", response_model=None)
async def github_callback(
    request: Request,
    ctx: ProjectContext = Depends(get_project_context),
    github_mgr: GitHubClientManager = Depends(get_github_client_manager),
) -> RedirectResponse:
    """Handle GitHub App installation callback redirect."""
    installation_id_str = request.query_params.get("installation_id", "")
    redirect_base = f"/projects/{ctx.project_slug}/configs/github"

    if not installation_id_str:
        return RedirectResponse(f"{redirect_base}?error=missing_installation_id")

    installation_id = int(installation_id_str)

    service = github_mgr.get_installation_service(ctx.project_id)
    if service:
        try:
            await service.fetch_and_store(installation_id)
        except Exception:
            logger.exception("Failed to store installation %d from callback", installation_id)
            return RedirectResponse(f"{redirect_base}?error=failed_to_store")

    return RedirectResponse(f"{redirect_base}?installation_id={installation_id}")


# ── Installations ────────────────────────────────────────────────


@router.get("/installations")
async def list_installations(
    ctx: ProjectContext = Depends(get_project_context),
    github_mgr: GitHubClientManager = Depends(get_github_client_manager),
) -> list[GitHubInstallationResponse]:
    """List the project's GitHub App installations."""
    await github_mgr.get_client(ctx.project_id)
    service = github_mgr.get_installation_service(ctx.project_id)
    if service is None:
        return []
    installations = await service.list_installations()
    return [GitHubInstallationResponse.model_validate(i) for i in installations]


@router.post("/installations")
async def add_installation(
    body: GitHubInstallationCreate,
    ctx: ProjectContext = Depends(require_project_admin),
    github_mgr: GitHubClientManager = Depends(get_github_client_manager),
) -> GitHubInstallationResponse:
    """Manually add a GitHub App installation."""
    await github_mgr.get_client(ctx.project_id)
    service = github_mgr.get_installation_service(ctx.project_id)
    if service is None:
        raise HTTPException(400, "GitHub integration not configured in project settings")
    try:
        inst = await service.fetch_and_store(body.installation_id)
    except Exception as exc:
        raise HTTPException(400, f"Failed to fetch installation info: {exc}") from exc
    return GitHubInstallationResponse.model_validate(inst)


@router.post("/installations/{installation_id}/sync")
async def sync_installation(
    installation_id: str,
    ctx: ProjectContext = Depends(get_project_context),
    github_mgr: GitHubClientManager = Depends(get_github_client_manager),
) -> list[GitHubRepoResponse]:
    """Re-fetch the repo list for an installation from the GitHub API."""
    await github_mgr.get_client(ctx.project_id)
    service = github_mgr.get_installation_service(ctx.project_id)
    if service is None:
        raise HTTPException(400, "GitHub integration not configured in project settings")
    inst = await service.get_installation(installation_id)
    if inst is None:
        raise HTTPException(404, "Installation not found")
    repos = await service.sync_repos(inst.installation_id)
    return [GitHubRepoResponse(**r) for r in repos]


@router.delete("/installations/{installation_id}", response_model=None)
async def remove_installation(
    installation_id: str,
    ctx: ProjectContext = Depends(require_project_admin),
    github_mgr: GitHubClientManager = Depends(get_github_client_manager),
) -> JSONResponse:
    """Remove an installation record."""
    await github_mgr.get_client(ctx.project_id)
    service = github_mgr.get_installation_service(ctx.project_id)
    if service is None:
        raise HTTPException(400, "GitHub integration not configured in project settings")
    deleted = await service.delete_installation(installation_id)
    if not deleted:
        raise HTTPException(404, "Installation not found")
    return JSONResponse({"status": "deleted"})


@router.get("/repos")
async def list_repos(
    ctx: ProjectContext = Depends(get_project_context),
    github_mgr: GitHubClientManager = Depends(get_github_client_manager),
) -> list[GitHubRepoResponse]:
    """List repos across all of the project's installations."""
    await github_mgr.get_client(ctx.project_id)
    service = github_mgr.get_installation_service(ctx.project_id)
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
