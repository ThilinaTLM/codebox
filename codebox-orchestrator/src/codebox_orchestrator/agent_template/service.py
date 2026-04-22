"""Business logic for agent templates: validation, cron parsing, scheduling hooks."""

from __future__ import annotations

import logging
import re
import zoneinfo
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING, Any, Protocol

from croniter import croniter
from sqlalchemy.exc import IntegrityError

from codebox_orchestrator.agent_template.application.allowed_fields import (
    allowed_fields_for,
    valid_ops_for,
)
from codebox_orchestrator.agent_template.models import AgentTemplate
from codebox_orchestrator.agent_template.schemas import (
    AgentTemplateCreate,
    AgentTemplateResponse,
    AgentTemplateRunResponse,
    AgentTemplateUpdate,
    TriggerFilterPredicate,
)

if TYPE_CHECKING:
    from codebox_orchestrator.agent_template.repository import AgentTemplateRepository
    from codebox_orchestrator.llm_profile.service import LLMProfileService

logger = logging.getLogger(__name__)

MAX_SCHEDULED_TEMPLATES_PER_PROJECT = 100
MIN_SCHEDULE_INTERVAL_SECONDS = 5 * 60  # 5 minutes
TEMPLATE_NAME_RE = re.compile(r"^[\w\s][\w\s\-]*$")


class SchedulerHandle(Protocol):
    """Minimal interface the scheduler exposes back to the service layer."""

    def notify_template_changed(self, template: AgentTemplate) -> None: ...


class _NoopSchedulerHandle:
    """Default handle used until the scheduler starts or in contexts w/o one."""

    def notify_template_changed(self, template: AgentTemplate) -> None:  # noqa: ARG002
        return None


class AgentTemplateService:
    """Commands + queries for project-scoped agent templates."""

    def __init__(
        self,
        repo: AgentTemplateRepository,
        *,
        llm_profile_service: LLMProfileService,
        scheduler_handle: SchedulerHandle | None = None,
    ) -> None:
        self._repo = repo
        self._llm_profile_service = llm_profile_service
        self._scheduler_handle: SchedulerHandle = scheduler_handle or _NoopSchedulerHandle()

    def set_scheduler_handle(self, handle: SchedulerHandle) -> None:
        """Wire the scheduler handle post-construction (lifespan ordering)."""
        self._scheduler_handle = handle

    # ── Queries ─────────────────────────────────────────────────

    async def list(
        self,
        project_id: str,
        *,
        trigger_kind: str | None = None,
        enabled: bool | None = None,
    ) -> list[AgentTemplateResponse]:
        templates = await self._repo.list(project_id, trigger_kind=trigger_kind, enabled=enabled)
        return [self._to_response(t) for t in templates]

    async def get(self, project_id: str, template_id: str) -> AgentTemplateResponse | None:
        template = await self._repo.get(template_id, project_id=project_id)
        if template is None:
            return None
        return self._to_response(template)

    async def list_runs(
        self,
        project_id: str,
        *,
        template_id: str | None = None,
        status: str | None = None,
        cursor: tuple[datetime, str] | None = None,
        limit: int = 50,
    ) -> list[AgentTemplateRunResponse]:
        runs = await self._repo.list_runs(
            project_id,
            template_id=template_id,
            status=status,
            cursor=cursor,
            limit=limit,
        )
        return [
            AgentTemplateRunResponse(
                id=r.id,
                project_id=r.project_id,
                template_id=r.template_id,
                box_id=r.box_id,
                github_event_id=r.github_event_id,
                trigger_kind=r.trigger_kind,
                status=r.status,
                error=r.error,
                created_at=r.created_at,
            )
            for r in runs
        ]

    # ── Commands ────────────────────────────────────────────────

    async def create(
        self,
        project_id: str,
        created_by: str | None,
        data: AgentTemplateCreate,
    ) -> AgentTemplateResponse:
        await self._validate(project_id, data, existing=None)
        next_run_at: datetime | None = None
        if data.trigger_kind == "schedule":
            next_run_at = self._compute_next_run_at(
                data.schedule_cron or "",
                data.schedule_timezone or "UTC",
                datetime.now(UTC),
            )
            await self._enforce_scheduled_cap(project_id)

        template = AgentTemplate(
            project_id=project_id,
            name=data.name,
            description=data.description,
            enabled=data.enabled,
            trigger_kind=data.trigger_kind,
            trigger_filters=[p.model_dump() for p in data.trigger_filters]
            if data.trigger_filters is not None
            else None,
            schedule_cron=data.schedule_cron,
            schedule_timezone=data.schedule_timezone or "UTC"
            if data.trigger_kind == "schedule"
            else None,
            next_run_at=next_run_at,
            workspace_mode=data.workspace_mode,
            pinned_repo=data.pinned_repo,
            pinned_branch=data.pinned_branch,
            system_prompt=data.system_prompt,
            initial_prompt=data.initial_prompt,
            llm_profile_id=data.llm_profile_id,
            created_by=created_by,
        )
        try:
            template = await self._repo.create(template)
        except IntegrityError as exc:
            raise ValueError("Template name must be unique within project") from exc
        if template.trigger_kind == "schedule" and template.enabled:
            self._scheduler_handle.notify_template_changed(template)
        return self._to_response(template)

    async def update(
        self,
        project_id: str,
        template_id: str,
        data: AgentTemplateUpdate,
    ) -> AgentTemplateResponse | None:
        existing = await self._repo.get(template_id, project_id=project_id)
        if existing is None:
            return None

        # Resolve effective values: override with update data when provided
        merged = AgentTemplateCreate(
            name=data.name if data.name is not None else existing.name,
            description=data.description if data.description is not None else existing.description,
            enabled=data.enabled if data.enabled is not None else existing.enabled,
            trigger_kind=data.trigger_kind
            if data.trigger_kind is not None
            else existing.trigger_kind,  # type: ignore[arg-type]
            trigger_filters=[
                TriggerFilterPredicate.model_validate(p) for p in data.trigger_filters
            ]
            if data.trigger_filters is not None
            else (
                [TriggerFilterPredicate.model_validate(p) for p in existing.trigger_filters]
                if existing.trigger_filters
                else None
            ),
            schedule_cron=data.schedule_cron
            if data.schedule_cron is not None
            else existing.schedule_cron,
            schedule_timezone=data.schedule_timezone
            if data.schedule_timezone is not None
            else (existing.schedule_timezone or "UTC"),
            workspace_mode=data.workspace_mode
            if data.workspace_mode is not None
            else existing.workspace_mode,  # type: ignore[arg-type]
            pinned_repo=data.pinned_repo if data.pinned_repo is not None else existing.pinned_repo,
            pinned_branch=data.pinned_branch
            if data.pinned_branch is not None
            else existing.pinned_branch,
            system_prompt=data.system_prompt
            if data.system_prompt is not None
            else existing.system_prompt,
            initial_prompt=data.initial_prompt
            if data.initial_prompt is not None
            else existing.initial_prompt,
            llm_profile_id=data.llm_profile_id
            if data.llm_profile_id is not None
            else existing.llm_profile_id,
        )
        await self._validate(project_id, merged, existing=existing)

        fields: dict[str, Any] = {
            "name": merged.name,
            "description": merged.description,
            "enabled": merged.enabled,
            "trigger_kind": merged.trigger_kind,
            "trigger_filters": [p.model_dump() for p in merged.trigger_filters]
            if merged.trigger_filters is not None
            else None,
            "schedule_cron": merged.schedule_cron if merged.trigger_kind == "schedule" else None,
            "schedule_timezone": (merged.schedule_timezone or "UTC")
            if merged.trigger_kind == "schedule"
            else None,
            "workspace_mode": merged.workspace_mode,
            "pinned_repo": merged.pinned_repo,
            "pinned_branch": merged.pinned_branch,
            "system_prompt": merged.system_prompt,
            "initial_prompt": merged.initial_prompt,
            "llm_profile_id": merged.llm_profile_id,
        }

        # Recompute next_run_at when schedule-relevant fields change
        schedule_relevant_change = (
            merged.trigger_kind == "schedule"
            and merged.enabled
            and (
                data.schedule_cron is not None
                or data.schedule_timezone is not None
                or data.trigger_kind is not None
                or data.enabled is not None
            )
        )
        if merged.trigger_kind != "schedule" or not merged.enabled:
            fields["next_run_at"] = None
        elif schedule_relevant_change:
            fields["next_run_at"] = self._compute_next_run_at(
                merged.schedule_cron or "",
                merged.schedule_timezone or "UTC",
                datetime.now(UTC),
            )

        try:
            updated = await self._repo.update(template_id, project_id=project_id, **fields)
        except IntegrityError as exc:
            raise ValueError("Template name must be unique within project") from exc
        if updated is None:
            return None
        if updated.trigger_kind == "schedule" and updated.enabled:
            self._scheduler_handle.notify_template_changed(updated)
        return self._to_response(updated)

    async def delete(self, project_id: str, template_id: str) -> bool:
        return await self._repo.delete(template_id, project_id=project_id)

    # ── Validation ──────────────────────────────────────────────

    async def _validate(  # noqa: PLR0912
        self,
        project_id: str,
        data: AgentTemplateCreate,
        *,
        existing: AgentTemplate | None,
    ) -> None:
        # Name / prompt sanity — most length limits come from Pydantic
        if not data.initial_prompt.strip():
            raise ValueError("initial_prompt: must be non-empty")

        # workspace mode rules by trigger kind
        if data.trigger_kind == "github.push" and data.workspace_mode == "branch_from_issue":
            raise ValueError("workspace_mode: branch_from_issue is not valid for github.push")
        if data.trigger_kind == "schedule" and data.workspace_mode != "pinned":
            raise ValueError("workspace_mode: scheduled templates must use 'pinned'")

        if data.workspace_mode == "pinned" and (not data.pinned_repo or not data.pinned_branch):
            raise ValueError("pinned_repo/pinned_branch: required when workspace_mode is 'pinned'")

        # Trigger-specific rules
        if data.trigger_kind == "schedule":
            if not data.schedule_cron:
                raise ValueError("schedule_cron: required for scheduled templates")
            if not croniter.is_valid(data.schedule_cron):
                raise ValueError(f"schedule_cron: invalid cron expression: {data.schedule_cron}")
            tz_name = data.schedule_timezone or "UTC"
            try:
                zoneinfo.ZoneInfo(tz_name)
            except Exception as exc:
                raise ValueError(f"schedule_timezone: invalid IANA timezone: {tz_name}") from exc
            # Enforce ≥ 5 min between two successive fires
            self._enforce_min_interval(data.schedule_cron, tz_name)

        # Filter field validation
        if data.trigger_filters:
            allowed = allowed_fields_for(data.trigger_kind)
            if not allowed and data.trigger_filters:
                raise ValueError(
                    "trigger_filters: no filter fields defined for "
                    f"trigger_kind={data.trigger_kind}"
                )
            for pred in data.trigger_filters:
                if pred.field not in allowed:
                    raise ValueError(
                        f"trigger_filters: field '{pred.field}' is not allowed for "
                        f"trigger_kind={data.trigger_kind}"
                    )
                field_type = allowed[pred.field]
                if pred.op not in valid_ops_for(field_type):
                    raise ValueError(
                        f"trigger_filters: op '{pred.op}' is not valid for field "
                        f"'{pred.field}' (type {field_type})"
                    )
                # Value shape validation for list ops
                if pred.op in {"in", "contains_any"} and not isinstance(pred.value, list):
                    raise ValueError(
                        f"trigger_filters: op '{pred.op}' requires a list value on field "
                        f"'{pred.field}'"
                    )
                if pred.op in {"eq", "matches"} and not isinstance(pred.value, str):
                    raise ValueError(
                        f"trigger_filters: op '{pred.op}' requires a string value on field "
                        f"'{pred.field}'"
                    )
                if pred.op == "matches":
                    try:
                        re.compile(pred.value)  # type: ignore[arg-type]
                    except re.error as exc:
                        raise ValueError(
                            f"trigger_filters: invalid regex on field '{pred.field}': {exc}"
                        ) from exc

        # LLM profile ownership
        if data.llm_profile_id:
            resolved = await self._llm_profile_service.resolve_profile(
                data.llm_profile_id, project_id
            )
            if resolved is None:
                raise ValueError(
                    f"llm_profile_id: profile {data.llm_profile_id} not found in this project"
                )

        # Name uniqueness is enforced at the DB layer; no pre-check race.
        _ = existing  # reserved for future cross-field rules requiring previous state

    async def _enforce_scheduled_cap(self, project_id: str) -> None:
        count = await self._repo.count_scheduled(project_id)
        if count >= MAX_SCHEDULED_TEMPLATES_PER_PROJECT:
            raise ValueError(
                f"At most {MAX_SCHEDULED_TEMPLATES_PER_PROJECT} scheduled templates per project"
            )

    @staticmethod
    def _enforce_min_interval(cron: str, tz_name: str) -> None:
        tz = zoneinfo.ZoneInfo(tz_name)
        now_tz = datetime.now(tz)
        itr = croniter(cron, now_tz)
        first = itr.get_next(datetime)
        second = itr.get_next(datetime)
        if (second - first) < timedelta(seconds=MIN_SCHEDULE_INTERVAL_SECONDS):
            raise ValueError(
                f"schedule_cron: fire interval must be >= "
                f"{MIN_SCHEDULE_INTERVAL_SECONDS // 60} minutes"
            )

    @staticmethod
    def _compute_next_run_at(cron: str, tz_name: str, now_utc: datetime) -> datetime:
        tz = zoneinfo.ZoneInfo(tz_name)
        now_tz = now_utc.astimezone(tz)
        itr = croniter(cron, now_tz)
        next_tz: datetime = itr.get_next(datetime)
        return next_tz.astimezone(UTC)

    # ── Rendering helpers ──────────────────────────────────────

    @staticmethod
    def _to_response(template: AgentTemplate) -> AgentTemplateResponse:
        filters = None
        if template.trigger_filters is not None:
            filters = [TriggerFilterPredicate.model_validate(p) for p in template.trigger_filters]
        return AgentTemplateResponse(
            id=template.id,
            project_id=template.project_id,
            name=template.name,
            description=template.description,
            enabled=template.enabled,
            trigger_kind=template.trigger_kind,
            trigger_filters=filters,
            schedule_cron=template.schedule_cron,
            schedule_timezone=template.schedule_timezone,
            next_run_at=template.next_run_at,
            workspace_mode=template.workspace_mode,
            pinned_repo=template.pinned_repo,
            pinned_branch=template.pinned_branch,
            system_prompt=template.system_prompt,
            initial_prompt=template.initial_prompt,
            llm_profile_id=template.llm_profile_id,
            created_at=template.created_at,
            updated_at=template.updated_at,
            created_by=template.created_by,
        )
