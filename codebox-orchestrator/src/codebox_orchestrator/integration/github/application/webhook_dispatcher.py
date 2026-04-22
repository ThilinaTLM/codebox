"""GitHub webhook dispatcher — drives AgentTemplate matching and box fan-out.

Replaces the legacy ``@<bot>``-mention handler. Prompts are now user-authored
per template; the dispatcher simply:

1. Dedups by delivery_id
2. Persists the raw event
3. Routes system events (installation, ping, …) to their handlers
4. Maps event type → trigger_kind and fans out to every enabled matching
   template (one box per match)

All user-controlled fields (issue/comment body, review text, …) are
interpolated into prompts verbatim by the renderer. Agent-side tool allow-lists
and system-prompt policy are the supported defenses against prompt injection.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from codebox_orchestrator.integration.github.application.setup_commands import (
    build_setup_commands,
)

if TYPE_CHECKING:
    from codebox_orchestrator.agent_template.application.context_builders import (
        ContextBuilderRegistry,
    )
    from codebox_orchestrator.agent_template.application.matcher import TemplateMatcher
    from codebox_orchestrator.agent_template.application.renderer import PromptRenderer
    from codebox_orchestrator.agent_template.repository import AgentTemplateRepository
    from codebox_orchestrator.box.application.commands.create_box import CreateBoxHandler
    from codebox_orchestrator.integration.github.infrastructure.github_api_client import (
        GitHubApiClient,
    )
    from codebox_orchestrator.integration.github.infrastructure.github_repository import (
        SqlAlchemyGitHubRepository,
    )
    from codebox_orchestrator.llm_profile.service import LLMProfileService
    from codebox_orchestrator.project_settings.service import ProjectSettingsService

logger = logging.getLogger(__name__)


EVENT_TYPE_TO_TRIGGER_KIND: dict[str, str] = {
    "issues": "github.issues",
    "issue_comment": "github.issue_comment",
    "pull_request": "github.pull_request",
    "pull_request_review": "github.pull_request_review",
    "pull_request_review_comment": "github.pull_request_review_comment",
    "push": "github.push",
}

# Events we persist + handle but never fan out to templates
_SYSTEM_EVENT_TYPES = {
    "installation",
    "installation_repositories",
    "ping",
    "github_app_authorization",
}


@dataclass
class DispatchResult:
    matched: int = 0
    spawned: int = 0
    skipped: int = 0
    errors: int = 0
    event_id: str | None = None


class GitHubWebhookDispatcher:
    """Maps GitHub webhooks to AgentTemplate runs for a single project."""

    def __init__(
        self,
        *,
        api_client: GitHubApiClient,
        github_repo: SqlAlchemyGitHubRepository,
        template_repo: AgentTemplateRepository,
        matcher: TemplateMatcher,
        renderer: PromptRenderer,
        context_builder_registry: ContextBuilderRegistry,
        create_box: CreateBoxHandler,
        profile_service: LLMProfileService,
        settings_service: ProjectSettingsService,
        project_id: str,
        default_base_branch: str = "main",
    ) -> None:
        self._api = api_client
        self._github_repo = github_repo
        self._template_repo = template_repo
        self._matcher = matcher
        self._renderer = renderer
        self._registry = context_builder_registry
        self._create_box = create_box
        self._profile_service = profile_service
        self._settings_service = settings_service
        self._project_id = project_id
        self._default_base_branch = default_base_branch

    def verify_signature(self, payload: bytes, signature: str) -> bool:
        return self._api.verify_webhook_signature(payload, signature)

    async def dispatch(  # noqa: PLR0911, PLR0912
        self, event_type: str, delivery_id: str, payload: dict[str, Any]
    ) -> DispatchResult:
        result = DispatchResult()

        # 1. Dedup
        if await self._github_repo.event_exists(delivery_id):
            logger.info("duplicate webhook delivery %s, skipping", delivery_id)
            return result

        # 2. Persist event
        action = payload.get("action", "")
        repo_data = payload.get("repository") or {}
        repository = str(repo_data.get("full_name") or "")
        event_id = await self._github_repo.store_event(
            delivery_id=delivery_id,
            event_type=event_type,
            action=str(action) if action is not None else "",
            repository=repository,
            payload=json.dumps(payload),
            project_id=self._project_id,
        )
        result.event_id = event_id

        # 3. System events (installation, ping, …) — never match templates
        if event_type in _SYSTEM_EVENT_TYPES:
            await self._handle_system_event(event_type, payload)
            return result

        # 4. Map to trigger kind
        trigger_kind = EVENT_TYPE_TO_TRIGGER_KIND.get(event_type)
        if trigger_kind is None:
            logger.debug("unsupported event type %s (delivery %s)", event_type, delivery_id)
            return result

        # 5. Load enabled templates for (project, kind)
        templates = await self._template_repo.list_enabled_for_event(
            self._project_id, trigger_kind
        )
        if not templates:
            return result

        # 6. Build event context once
        builder = self._registry.get(trigger_kind)
        if builder is None:
            logger.error("no context builder for trigger_kind=%s", trigger_kind)
            return result
        installation_id_val: int | None = None
        installation = payload.get("installation") or {}
        raw_inst = installation.get("id")
        if raw_inst is not None:
            try:
                installation_id_val = int(raw_inst)
            except (TypeError, ValueError):
                installation_id_val = None

        try:
            context = await builder.build(
                project_id=self._project_id,
                payload=payload,
                api=self._api,
                installation_id=installation_id_val,
            )
        except Exception:
            logger.exception(
                "context builder failed for trigger_kind=%s (delivery %s)",
                trigger_kind,
                delivery_id,
            )
            return result

        # 7. For each template, match + spawn
        for template in templates:
            predicates = template.trigger_filters
            matched, reason = self._matcher.matches(predicates, context)
            if not matched:
                result.skipped += 1
                await self._template_repo.record_run(
                    project_id=self._project_id,
                    template_id=template.id,
                    trigger_kind=trigger_kind,
                    status="skipped_filter",
                    github_event_id=event_id,
                    error=reason,
                )
                continue

            result.matched += 1
            try:
                box_id = await self._spawn_for_template(
                    template=template,
                    context=context,
                    installation_id=installation_id_val,
                )
                if box_id is not None:
                    result.spawned += 1
                    await self._template_repo.record_run(
                        project_id=self._project_id,
                        template_id=template.id,
                        trigger_kind=trigger_kind,
                        status="spawned",
                        box_id=box_id,
                        github_event_id=event_id,
                    )
                else:
                    result.errors += 1
            except Exception as exc:
                logger.exception(
                    "failed to spawn template %s on event %s",
                    template.id,
                    delivery_id,
                )
                result.errors += 1
                await self._template_repo.record_run(
                    project_id=self._project_id,
                    template_id=template.id,
                    trigger_kind=trigger_kind,
                    status="error",
                    github_event_id=event_id,
                    error=str(exc),
                )

        logger.info(
            "github_dispatch project=%s event=%s matched=%d spawned=%d skipped=%d errors=%d",
            self._project_id,
            event_type,
            result.matched,
            result.spawned,
            result.skipped,
            result.errors,
        )
        return result

    # ── Internals ───────────────────────────────────────────────

    async def _handle_system_event(self, event_type: str, payload: dict[str, Any]) -> None:
        if event_type == "installation":
            action = payload.get("action")
            installation = payload.get("installation") or {}
            if action == "created":
                account = installation.get("account") or {}
                await self._github_repo.store_installation(
                    installation_id=int(installation.get("id") or 0),
                    account_login=str(account.get("login") or ""),
                    account_type=str(account.get("type") or "User"),
                    project_id=self._project_id,
                )

    async def _spawn_for_template(
        self,
        *,
        template: Any,
        context: Any,
        installation_id: int | None,
    ) -> str | None:
        # Resolve LLM profile
        profile_id = (
            template.llm_profile_id
            or await self._settings_service.get_default_profile_id(self._project_id)
        )
        if not profile_id:
            logger.error(
                "no LLM profile for template %s and no project default",
                template.id,
            )
            return None
        resolved = await self._profile_service.resolve_profile(profile_id, self._project_id)
        if resolved is None:
            logger.error("LLM profile %s not found for project %s", profile_id, self._project_id)
            return None

        # Installation handle for the box
        db_installation = None
        if installation_id is not None:
            db_installation = await self._github_repo.get_installation_by_github_id(
                installation_id, project_id=self._project_id
            )
            if db_installation is None:
                # Lazy-store: manifest flow or a missed installation event
                account = {"login": "", "type": "User"}
                db_installation = await self._github_repo.store_installation(
                    installation_id=installation_id,
                    account_login=str(account.get("login") or ""),
                    account_type=str(account.get("type") or "User"),
                    project_id=self._project_id,
                )

        # Workspace setup — compute branch the agent actually lands on
        token_placeholder = ""  # real token fetched by box_lifecycle via installation handle
        try:
            _, work_branch = build_setup_commands(
                mode=template.workspace_mode,
                repo=template.pinned_repo or context.repo or "",
                token=token_placeholder,
                issue_number=context.issue_number,
                issue_title=context.variables.get("ISSUE_TITLE"),
                ref=context.branch_hint,
                branch=template.pinned_branch,
            )
        except Exception:
            logger.exception("build_setup_commands failed for template %s", template.id)
            return None

        # Render prompts
        variables = context.variables
        rendered_initial = self._renderer.render(template.initial_prompt, variables)
        rendered_system = (
            self._renderer.render(template.system_prompt, variables)
            if template.system_prompt
            else None
        )

        # Build box name
        title = variables.get("ISSUE_TITLE") or variables.get("PR_NUMBER") or template.trigger_kind
        box_name = f"[Template:{template.name}] {title}"[:200]

        # Tavily key — best-effort
        tavily_key = None
        try:
            tavily_key = await self._settings_service.get_tavily_api_key(self._project_id)
        except Exception:
            tavily_key = None

        # Spawn box
        view = await self._create_box.execute(
            name=box_name,
            provider=resolved.provider,
            model=resolved.model,
            api_key=resolved.api_key,
            base_url=resolved.base_url,
            tavily_api_key=tavily_key,
            system_prompt=rendered_system,
            auto_start_prompt=rendered_initial,
            trigger=template.trigger_kind,
            github_installation_id=db_installation.id if db_installation else None,
            github_repo=template.pinned_repo or context.repo,
            github_issue_number=context.issue_number,
            github_trigger_url=context.trigger_url,
            github_branch=work_branch,
            github_workspace_mode=template.workspace_mode,
            github_workspace_ref=context.branch_hint,
            project_id=self._project_id,
        )
        return view.id
