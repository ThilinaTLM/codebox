"""Cron-driven scheduler for ``schedule`` templates.

- Single-leader election via the ``scheduler_locks`` row
- DB-polled tick loop with ``SELECT ... FOR UPDATE SKIP LOCKED``
- Spawns boxes *after* committing ``next_run_at`` to avoid double-fires on crash
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import zoneinfo
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

from croniter import croniter
from sqlalchemy import select, update

from codebox_orchestrator.agent_template.models import AgentTemplate, SchedulerLock
from codebox_orchestrator.integration.github.application.setup_commands import (
    build_setup_commands,
)

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import async_sessionmaker

    from codebox_orchestrator.agent_template.application.context_builders import (
        ContextBuilder,
    )
    from codebox_orchestrator.agent_template.application.renderer import PromptRenderer
    from codebox_orchestrator.agent_template.repository import AgentTemplateRepository
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

LOCK_NAME = "agent_template_scheduler"
LOCK_STALE_SECONDS = 90
HEARTBEAT_SECONDS = 30
POLL_INTERVAL_SECONDS = 30


class AgentTemplateScheduler:
    """HA-safe cron loop firing scheduled agent templates."""

    def __init__(
        self,
        *,
        session_factory: async_sessionmaker,
        template_repo: AgentTemplateRepository,
        renderer: PromptRenderer,
        context_builder: ContextBuilder | None,
        github_mgr: GitHubClientManager,
        create_box: CreateBoxHandler,
        profile_service: LLMProfileService,
        settings_service: ProjectSettingsService,
        github_repo: SqlAlchemyGitHubRepository,
        instance_id: str,
    ) -> None:
        self._sf = session_factory
        self._repo = template_repo
        self._renderer = renderer
        self._context_builder = context_builder
        self._github_mgr = github_mgr
        self._create_box = create_box
        self._profile_service = profile_service
        self._settings_service = settings_service
        self._github_repo = github_repo
        self._instance_id = instance_id
        self._stopping = False
        self._wake_event: asyncio.Event = asyncio.Event()
        self._task: asyncio.Task[None] | None = None
        self._is_leader = False
        self._last_heartbeat: datetime | None = None

    # ── Lifecycle ───────────────────────────────────────────────

    async def start(self) -> None:
        if self._task is not None:
            return
        self._stopping = False
        self._task = asyncio.create_task(self._run(), name="agent-template-scheduler")

    async def stop(self) -> None:
        self._stopping = True
        self._wake_event.set()
        if self._task is not None:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await self._task
            self._task = None
        if self._is_leader:
            try:
                await self._release_lock()
            except Exception:
                logger.warning(
                    "failed to release scheduler lock on shutdown",
                    exc_info=True,
                )

    def notify_template_changed(self, template: AgentTemplate) -> None:  # noqa: ARG002
        """Wake the tick loop early — e.g. to pick up a newly-created template."""
        self._wake_event.set()

    # ── Main loop ───────────────────────────────────────────────

    async def _run(self) -> None:
        while not self._stopping:
            try:
                if not await self._ensure_leader():
                    await self._sleep_or_wake(POLL_INTERVAL_SECONDS)
                    continue
                await self._heartbeat()
                await self._tick()
                sleep_for = await self._seconds_until_next()
                await self._sleep_or_wake(min(sleep_for, POLL_INTERVAL_SECONDS))
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("scheduler tick failed")
                await self._sleep_or_wake(POLL_INTERVAL_SECONDS)

    async def _tick(self) -> None:
        now = datetime.now(UTC)
        due: list[AgentTemplate] = []
        async with self._sf() as session:
            # Lock rows + bump next_run_at before spawning so a crash doesn't re-fire
            result = await session.execute(
                select(AgentTemplate)
                .where(
                    AgentTemplate.trigger_kind == "schedule",
                    AgentTemplate.enabled.is_(True),
                    AgentTemplate.next_run_at.isnot(None),
                    AgentTemplate.next_run_at <= now,
                )
                .order_by(AgentTemplate.next_run_at)
                .limit(50)
                .with_for_update(skip_locked=True)
            )
            due = list(result.scalars().all())
            for tpl in due:
                try:
                    tpl.next_run_at = self._compute_next(
                        tpl.schedule_cron or "",
                        tpl.schedule_timezone or "UTC",
                        now,
                    )
                except Exception:
                    logger.exception("failed to compute next_run_at for template %s", tpl.id)
                    # Shift forward by 1 hour so we don't tight-loop on a bad cron
                    tpl.next_run_at = now + timedelta(hours=1)
            await session.commit()

        if due:
            logger.info("scheduler.tick claimed=%d", len(due))

        for tpl in due:
            # Re-query a fresh detached copy so we don't hit stale session issues
            await self._spawn(tpl, fired_at=now)

    # ── Spawn ───────────────────────────────────────────────────

    async def _spawn(self, tpl: AgentTemplate, *, fired_at: datetime) -> None:
        try:
            await self._do_spawn(tpl, fired_at=fired_at)
        except Exception as exc:
            logger.exception("scheduler.spawn template=%s status=error", tpl.id)
            await self._repo.record_run(
                project_id=tpl.project_id,
                template_id=tpl.id,
                trigger_kind="schedule",
                status="error",
                error=str(exc),
            )

    async def _do_spawn(self, tpl: AgentTemplate, *, fired_at: datetime) -> None:
        if self._context_builder is None:
            msg = "no scheduled context builder registered"
            raise RuntimeError(msg)
        context = await self._context_builder.build(
            project_id=tpl.project_id,
            template=tpl,
            fired_at=fired_at,
        )
        initial = self._renderer.render(tpl.initial_prompt, context.variables)
        system = (
            self._renderer.render(tpl.system_prompt, context.variables)
            if tpl.system_prompt
            else None
        )
        profile_id = tpl.llm_profile_id or await self._settings_service.get_default_profile_id(
            tpl.project_id
        )
        if not profile_id:
            msg = "no LLM profile available for scheduled template"
            raise RuntimeError(msg)
        resolved = await self._profile_service.resolve_profile(profile_id, tpl.project_id)
        if resolved is None:
            msg = f"LLM profile {profile_id} missing"
            raise RuntimeError(msg)

        # Installation handle: pick any installation configured for the project
        # whose account matches pinned_repo's owner prefix.
        db_installation = None
        if tpl.pinned_repo:
            owner = tpl.pinned_repo.split("/")[0]
            installations = await self._github_repo.list_installations(tpl.project_id)
            for inst in installations:
                if inst.account_login.lower() == owner.lower():
                    db_installation = inst
                    break
            if db_installation is None and installations:
                db_installation = installations[0]

        # Compute workspace branch the agent will land on
        _, work_branch = build_setup_commands(
            mode="pinned",
            repo=tpl.pinned_repo or "",
            token="",
            branch=tpl.pinned_branch,
        )

        tavily_key = None
        try:
            tavily_key = await self._settings_service.get_tavily_api_key(tpl.project_id)
        except Exception:
            tavily_key = None

        view = await self._create_box.execute(
            name=f"[Template:{tpl.name}] scheduled"[:200],
            provider=resolved.provider,
            model=resolved.model,
            api_key=resolved.api_key,
            base_url=resolved.base_url,
            tavily_api_key=tavily_key,
            system_prompt=system,
            auto_start_prompt=initial,
            trigger="schedule",
            github_installation_id=db_installation.id if db_installation else None,
            github_repo=tpl.pinned_repo,
            github_branch=work_branch,
            github_workspace_mode="pinned",
            github_workspace_ref=tpl.pinned_branch,
            project_id=tpl.project_id,
        )
        await self._repo.record_run(
            project_id=tpl.project_id,
            template_id=tpl.id,
            trigger_kind="schedule",
            status="spawned",
            box_id=view.id,
        )
        logger.info("scheduler.spawn template=%s status=spawned box=%s", tpl.id, view.id)

    # ── Leader election ─────────────────────────────────────────

    async def _ensure_leader(self) -> bool:
        now = datetime.now(UTC)
        stale_before = now - timedelta(seconds=LOCK_STALE_SECONDS)
        async with self._sf() as session:
            stmt = (
                update(SchedulerLock)
                .where(
                    SchedulerLock.name == LOCK_NAME,
                    (SchedulerLock.holder.is_(None))
                    | (SchedulerLock.heartbeat_at < stale_before)
                    | (SchedulerLock.holder == self._instance_id),
                )
                .values(
                    holder=self._instance_id,
                    acquired_at=now,
                    heartbeat_at=now,
                )
                .execution_options(synchronize_session=False)
            )
            result = await session.execute(stmt)
            await session.commit()
            acquired = (result.rowcount or 0) > 0
        if acquired and not self._is_leader:
            logger.info("scheduler.lock acquired holder=%s", self._instance_id)
        self._is_leader = acquired
        return acquired

    async def _heartbeat(self) -> None:
        now = datetime.now(UTC)
        if (
            self._last_heartbeat is not None
            and (now - self._last_heartbeat).total_seconds() < HEARTBEAT_SECONDS
        ):
            return
        async with self._sf() as session:
            await session.execute(
                update(SchedulerLock)
                .where(
                    SchedulerLock.name == LOCK_NAME,
                    SchedulerLock.holder == self._instance_id,
                )
                .values(heartbeat_at=now)
            )
            await session.commit()
        self._last_heartbeat = now

    async def _release_lock(self) -> None:
        async with self._sf() as session:
            await session.execute(
                update(SchedulerLock)
                .where(
                    SchedulerLock.name == LOCK_NAME,
                    SchedulerLock.holder == self._instance_id,
                )
                .values(holder=None, heartbeat_at=None, acquired_at=None)
            )
            await session.commit()

    # ── Scheduling helpers ──────────────────────────────────────

    async def _seconds_until_next(self) -> float:
        nxt = await self._repo.min_next_run_at()
        if nxt is None:
            return float(POLL_INTERVAL_SECONDS)
        delta = (nxt - datetime.now(UTC)).total_seconds()
        return max(1.0, delta)

    async def _sleep_or_wake(self, seconds: float) -> None:
        self._wake_event.clear()
        with contextlib.suppress(TimeoutError):
            await asyncio.wait_for(self._wake_event.wait(), timeout=seconds)

    @staticmethod
    def _compute_next(cron: str, tz_name: str, now_utc: datetime) -> datetime:
        tz = zoneinfo.ZoneInfo(tz_name)
        now_tz = now_utc.astimezone(tz)
        itr = croniter(cron, now_tz)
        next_tz: datetime = itr.get_next(datetime)
        return next_tz.astimezone(UTC)
