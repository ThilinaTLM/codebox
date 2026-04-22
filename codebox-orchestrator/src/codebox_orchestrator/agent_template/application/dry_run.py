"""Dry-run evaluator — mirrors the webhook dispatcher but never spawns a box."""

from __future__ import annotations

from typing import TYPE_CHECKING

from codebox_orchestrator.agent_template.schemas import (
    AgentTemplateDryRunRequest,
    AgentTemplateDryRunResponse,
)

if TYPE_CHECKING:
    from codebox_orchestrator.agent_template.application.context import TemplateContext
    from codebox_orchestrator.agent_template.application.context_builders import (
        ContextBuilderRegistry,
    )
    from codebox_orchestrator.agent_template.application.matcher import TemplateMatcher
    from codebox_orchestrator.agent_template.application.renderer import PromptRenderer
    from codebox_orchestrator.agent_template.schemas import AgentTemplateResponse


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
    template: AgentTemplateResponse,
    body: AgentTemplateDryRunRequest,
    matcher: TemplateMatcher,
    renderer: PromptRenderer,
    registry: ContextBuilderRegistry,
) -> AgentTemplateDryRunResponse:
    trigger_kind = _resolve_trigger_kind(body, template.trigger_kind)
    if trigger_kind != template.trigger_kind:
        return AgentTemplateDryRunResponse(
            matched=False,
            reason=(
                f"event maps to trigger_kind={trigger_kind}, "
                f"template expects {template.trigger_kind}"
            ),
        )

    builder = registry.get(trigger_kind)
    if builder is None:
        raise ValueError(f"no context builder for trigger_kind={trigger_kind}")

    if trigger_kind == "schedule":
        from codebox_orchestrator.agent_template.models import AgentTemplate  # noqa: PLC0415

        # Build a lightweight stand-in AgentTemplate (not persisted)
        stand_in = AgentTemplate(
            project_id=template.project_id,
            name=template.name,
            trigger_kind=template.trigger_kind,
            workspace_mode=template.workspace_mode,
            schedule_cron=template.schedule_cron,
            schedule_timezone=template.schedule_timezone,
            pinned_repo=template.pinned_repo,
            pinned_branch=template.pinned_branch,
            initial_prompt=template.initial_prompt,
        )
        context = await builder.build(project_id=template.project_id, template=stand_in)
    else:
        payload = body.payload or {}
        context = await builder.build(project_id=template.project_id, payload=payload, api=None)

    predicates = (
        [p.model_dump() for p in template.trigger_filters] if template.trigger_filters else None
    )
    matched, reason = matcher.matches(predicates, context)
    if not matched:
        return AgentTemplateDryRunResponse(matched=False, reason=reason)

    rendered_system = (
        renderer.render(template.system_prompt, context.variables)
        if template.system_prompt
        else None
    )
    rendered_initial = renderer.render(template.initial_prompt, context.variables)

    setup_commands = _build_preview_setup_commands(template, context)

    return AgentTemplateDryRunResponse(
        matched=True,
        reason=None,
        rendered_system_prompt=rendered_system,
        rendered_initial_prompt=rendered_initial,
        setup_commands=setup_commands,
    )


def _resolve_trigger_kind(body: AgentTemplateDryRunRequest, template_kind: str) -> str:
    if body.schedule:
        return "schedule"
    if body.event_type is None:
        raise ValueError("dry-run requires either schedule=True or event_type+payload")
    kind = EVENT_TYPE_TO_TRIGGER_KIND.get(body.event_type)
    if kind is None:
        raise ValueError(f"dry-run: unsupported event_type {body.event_type!r}")
    return kind or template_kind


def _build_preview_setup_commands(
    template: AgentTemplateResponse,
    context: TemplateContext,
) -> list[str]:
    """Return a non-secret preview of the workspace setup commands."""
    from codebox_orchestrator.integration.github.application.setup_commands import (  # noqa: PLC0415
        build_setup_commands,
    )

    repo = template.pinned_repo or context.repo or ""
    if not repo:
        return []
    mode = template.workspace_mode
    issue_number = context.issue_number
    try:
        commands, _ = build_setup_commands(
            mode=mode,
            repo=repo,
            token="<REDACTED>",  # noqa: S106
            issue_number=issue_number,
            issue_title=context.variables.get("ISSUE_TITLE"),
            ref=context.branch_hint,
            branch=template.pinned_branch,
        )
    except Exception:
        return []
    return commands
