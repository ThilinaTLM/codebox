"""Shared automation-driven Box spawner.

Both ``webhook_dispatcher`` (event-driven) and ``scheduler`` (time-driven)
create a Box from an Automation. The two paths previously duplicated:

- LLM profile resolution (``automation.llm_profile_id`` → project default).
- Prompt rendering (initial + system) with unresolved-variable logging.
- Workspace branch computation via :func:`build_setup_commands`.
- Tavily-key best-effort fetch.
- ``CreateBoxHandler.execute`` invocation.

This module collapses those steps into :class:`AutomationBoxSpawner`. The
caller is responsible for:

- Building a :class:`SpawnContext` with already-resolved repo/branch hints
  and the resolved ``GitHubInstallation`` (or ``None`` for non-GitHub triggers).
  See :mod:`codebox_orchestrator.integration.github.domain.entities`.
- Recording the resulting :class:`SpawnResult` against the automation-runs
  table (the spawner does not write to that table — it stays a pure
  orchestration helper).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from codebox_orchestrator.integration.github.application.setup_commands import (
    build_setup_commands,
)

if TYPE_CHECKING:
    from collections.abc import Mapping

    from codebox_orchestrator.automation.application.renderer import PromptRenderer
    from codebox_orchestrator.automation.models import Automation
    from codebox_orchestrator.box.application.commands.create_box import CreateBoxHandler
    from codebox_orchestrator.integration.github.domain.entities import GitHubInstallation
    from codebox_orchestrator.llm_profile.service import LLMProfileService
    from codebox_orchestrator.project_settings.service import ProjectSettingsService

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class SpawnContext:
    """Per-spawn input shared by webhook and scheduler trigger paths.

    ``installation`` is the *already-resolved* GitHub installation handle
    (or ``None``). Resolution strategy is chosen by the caller — webhook
    uses ``installation_id`` from the event payload (with lazy-store
    fallback); scheduler uses
    :func:`integration.github.application.installation_resolver.resolve_installation_for_repo`.
    """

    project_id: str
    trigger_kind: str
    workspace_mode: str
    box_name: str
    base_repo: str | None = None
    branch_hint: str | None = None
    pinned_branch: str | None = None
    issue_number: int | None = None
    trigger_url: str | None = None
    installation: GitHubInstallation | None = None
    variables: Mapping[str, str] = field(default_factory=dict)


@dataclass(frozen=True)
class SpawnResult:
    """Outcome of an :meth:`AutomationBoxSpawner.spawn` call.

    On success ``box_id`` is set and ``error`` is ``None``. On a hard
    failure (no profile, render failure, create-box failure)
    ``box_id`` is ``None`` and ``error`` carries a human-readable message
    suitable for the automation-runs table.
    """

    box_id: str | None
    unresolved_variables: list[str]
    error: str | None

    @property
    def succeeded(self) -> bool:
        return self.box_id is not None and self.error is None


class AutomationBoxSpawner:
    """Resolves profile + setup, renders prompts, creates a Box.

    Used by webhook dispatcher (event-driven) and scheduler (time-driven).
    Stateless — safe to share across tasks.
    """

    def __init__(
        self,
        *,
        profile_service: LLMProfileService,
        settings_service: ProjectSettingsService,
        renderer: PromptRenderer,
        create_box: CreateBoxHandler,
    ) -> None:
        self._profile_service = profile_service
        self._settings_service = settings_service
        self._renderer = renderer
        self._create_box = create_box

    async def spawn(self, automation: Automation, context: SpawnContext) -> SpawnResult:
        # 1. Resolve LLM profile
        profile_id = (
            automation.llm_profile_id
            or await self._settings_service.get_default_profile_id(context.project_id)
        )
        if not profile_id:
            msg = "no LLM profile available for automation"
            logger.error("automation %s: %s", automation.id, msg)
            return SpawnResult(box_id=None, unresolved_variables=[], error=msg)
        resolved = await self._profile_service.resolve_profile(profile_id, context.project_id)
        if resolved is None:
            msg = f"LLM profile {profile_id} missing"
            logger.error("automation %s: %s", automation.id, msg)
            return SpawnResult(box_id=None, unresolved_variables=[], error=msg)

        # 2. Render prompts
        initial_result = self._renderer.render(automation.initial_prompt, context.variables)
        system_result = (
            self._renderer.render(automation.system_prompt, context.variables)
            if automation.system_prompt
            else None
        )
        unresolved: list[str] = sorted(
            {
                *initial_result.unresolved,
                *(system_result.unresolved if system_result else []),
            }
        )
        if unresolved:
            logger.warning(
                "automation render missing vars automation=%s trigger_kind=%s vars=%s",
                automation.id,
                context.trigger_kind,
                unresolved,
            )

        # 3. Compute workspace branch the agent will land on
        try:
            _, work_branch = build_setup_commands(
                mode=context.workspace_mode,
                repo=context.base_repo or "",
                token="",  # real token fetched by box_lifecycle via installation handle
                issue_number=context.issue_number,
                issue_title=context.variables.get("ISSUE_TITLE"),
                ref=context.branch_hint,
                branch=context.pinned_branch,
            )
        except Exception as exc:
            msg = f"build_setup_commands failed: {exc}"
            logger.exception("automation %s: %s", automation.id, msg)
            return SpawnResult(box_id=None, unresolved_variables=unresolved, error=msg)

        # 4. Tavily key — best-effort, never fatal
        try:
            tavily_key = await self._settings_service.get_tavily_api_key(context.project_id)
        except Exception:
            tavily_key = None

        # 5. Spawn the box
        try:
            view = await self._create_box.execute(
                name=context.box_name,
                provider=resolved.provider,
                model=resolved.model,
                api_key=resolved.api_key,
                base_url=resolved.base_url,
                tavily_api_key=tavily_key,
                system_prompt=system_result.text if system_result else None,
                auto_start_prompt=initial_result.text,
                trigger=context.trigger_kind,
                github_installation_id=(context.installation.id if context.installation else None),
                github_repo=context.base_repo,
                github_issue_number=context.issue_number,
                github_trigger_url=context.trigger_url,
                github_branch=work_branch,
                github_workspace_mode=context.workspace_mode,
                github_workspace_ref=context.branch_hint or context.pinned_branch,
                project_id=context.project_id,
            )
        except Exception as exc:
            msg = f"create_box failed: {exc}"
            logger.exception("automation %s: %s", automation.id, msg)
            return SpawnResult(box_id=None, unresolved_variables=unresolved, error=msg)

        return SpawnResult(box_id=view.id, unresolved_variables=unresolved, error=None)


__all__ = ["AutomationBoxSpawner", "SpawnContext", "SpawnResult"]
