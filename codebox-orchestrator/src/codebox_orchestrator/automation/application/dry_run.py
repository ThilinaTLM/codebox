"""Dry-run evaluator — mirrors the webhook dispatcher but never spawns a box."""

from __future__ import annotations

from typing import TYPE_CHECKING

from codebox_orchestrator.automation.schemas import (
    AutomationDryRunRequest,
    AutomationDryRunResponse,
)

if TYPE_CHECKING:
    from codebox_orchestrator.automation.application.context import TemplateContext
    from codebox_orchestrator.automation.application.context_builders import (
        ContextBuilderRegistry,
    )
    from codebox_orchestrator.automation.application.matcher import AutomationMatcher
    from codebox_orchestrator.automation.application.renderer import PromptRenderer
    from codebox_orchestrator.automation.schemas import AutomationResponse


EVENT_TYPE_TO_TRIGGER_KIND: dict[str, str] = {
    "issues": "github.issues",
    "issue_comment": "github.issue_comment",
    "pull_request": "github.pull_request",
    "pull_request_review": "github.pull_request_review",
    "pull_request_review_comment": "github.pull_request_review_comment",
    "push": "github.push",
}


async def execute_dry_run(
    *,
    automation: AutomationResponse,
    body: AutomationDryRunRequest,
    matcher: AutomationMatcher,
    renderer: PromptRenderer,
    registry: ContextBuilderRegistry,
) -> AutomationDryRunResponse:
    trigger_kind = _resolve_trigger_kind(body, automation.trigger_kind)
    if trigger_kind != automation.trigger_kind:
        return AutomationDryRunResponse(
            matched=False,
            reason=(
                f"event maps to trigger_kind={trigger_kind}, "
                f"automation expects {automation.trigger_kind}"
            ),
        )

    builder = registry.get(trigger_kind)
    if builder is None:
        raise ValueError(f"no context builder for trigger_kind={trigger_kind}")

    if trigger_kind == "schedule":
        from codebox_orchestrator.automation.models import Automation  # noqa: PLC0415

        # Build a lightweight stand-in Automation (not persisted)
        stand_in = Automation(
            project_id=automation.project_id,
            name=automation.name,
            trigger_repo=automation.trigger_repo,
            trigger_kind=automation.trigger_kind,
            workspace_mode=automation.workspace_mode,
            schedule_cron=automation.schedule_cron,
            schedule_timezone=automation.schedule_timezone,
            pinned_branch=automation.pinned_branch,
            initial_prompt=automation.initial_prompt,
        )
        context = await builder.build(project_id=automation.project_id, automation=stand_in)
    else:
        payload = body.payload or {}
        context = await builder.build(project_id=automation.project_id, payload=payload, api=None)

        # Structural gates — mirror the dispatcher. Repo first, then action.
        event_repo = str(((payload.get("repository") or {}).get("full_name")) or "")
        if event_repo and event_repo.lower() != automation.trigger_repo.lower():
            return AutomationDryRunResponse(
                matched=False,
                reason=(
                    f"skipped: event repo '{event_repo}' ≠ automation "
                    f"trigger_repo '{automation.trigger_repo}'"
                ),
            )
        event_action = str(payload.get("action") or "") or None
        if (
            automation.trigger_actions is not None
            and event_action is not None
            and event_action not in automation.trigger_actions
        ):
            return AutomationDryRunResponse(
                matched=False,
                reason=(
                    f"skipped: action '{event_action}' not in "
                    f"trigger_actions {sorted(automation.trigger_actions)!r}"
                ),
            )

    predicates = (
        [p.model_dump() for p in automation.trigger_filters]
        if automation.trigger_filters
        else None
    )
    matched, reason = matcher.matches(predicates, context)
    if not matched:
        return AutomationDryRunResponse(matched=False, reason=reason)

    system_result = (
        renderer.render(automation.system_prompt, context.variables)
        if automation.system_prompt
        else None
    )
    initial_result = renderer.render(automation.initial_prompt, context.variables)

    unresolved_set: set[str] = set()
    unresolved: list[str] = []
    for name in (
        *(initial_result.unresolved if initial_result else []),
        *(system_result.unresolved if system_result else []),
    ):
        if name not in unresolved_set:
            unresolved_set.add(name)
            unresolved.append(name)

    setup_commands = _build_preview_setup_commands(automation, context)

    return AutomationDryRunResponse(
        matched=True,
        reason=None,
        rendered_system_prompt=system_result.text if system_result else None,
        rendered_initial_prompt=initial_result.text,
        setup_commands=setup_commands,
        unresolved_variables=unresolved,
    )


def _resolve_trigger_kind(body: AutomationDryRunRequest, automation_kind: str) -> str:
    if body.schedule:
        return "schedule"
    if body.event_type is None:
        raise ValueError("dry-run requires either schedule=True or event_type+payload")
    kind = EVENT_TYPE_TO_TRIGGER_KIND.get(body.event_type)
    if kind is None:
        raise ValueError(f"dry-run: unsupported event_type {body.event_type!r}")
    return kind or automation_kind


def _build_preview_setup_commands(
    automation: AutomationResponse,
    context: TemplateContext,
) -> list[str]:
    """Return a non-secret preview of the workspace setup commands."""
    from codebox_orchestrator.integration.github.application.setup_commands import (  # noqa: PLC0415
        build_setup_commands,
    )

    repo = automation.trigger_repo or context.repo or ""
    if not repo:
        return []
    mode = automation.workspace_mode
    issue_number = context.issue_number
    try:
        commands, _ = build_setup_commands(
            mode=mode,
            repo=repo,
            token="<REDACTED>",  # noqa: S106
            issue_number=issue_number,
            issue_title=context.variables.get("ISSUE_TITLE"),
            ref=context.branch_hint,
            branch=automation.pinned_branch,
        )
    except Exception:
        return []
    return commands
