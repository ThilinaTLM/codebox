"""Cron-driven scheduler for ``schedule`` automations.

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

from codebox_orchestrator.automation.application.box_spawner import (
    AutomationBoxSpawner,
    SpawnContext,
)
from codebox_orchestrator.automation.models import Automation, SchedulerLock

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import async_sessionmaker

    from codebox_orchestrator.automation.application.context_builders import (
        ContextBuilder,
    )
    from codebox_orchestrator.automation.repository import AutomationRepository
    from codebox_orchestrator.integration.github.infrastructure.github_repository import (
        SqlAlchemyGitHubRepository,
    )

logger = logging.getLogger(__name__)

LOCK_NAME = "automation_scheduler"
LOCK_STALE_SECONDS = 90
HEARTBEAT_SECONDS = 30
POLL_INTERVAL_SECONDS = 30


class AutomationScheduler:
    """HA-safe cron loop firing scheduled automations."""

    def __init__(
        self,
        *,
        session_factory: async_sessionmaker,
        automation_repo: AutomationRepository,
        context_builder: ContextBuilder | None,
        spawner: AutomationBoxSpawner,
        github_repo: SqlAlchemyGitHubRepository,
        instance_id: str,
    ) -> None:
        self._sf = session_factory
        self._repo = automation_repo
        self._context_builder = context_builder
        self._spawner = spawner
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
        self._task = asyncio.create_task(self._run(), name="automation-scheduler")

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

    def notify_automation_changed(self, automation: Automation) -> None:  # noqa: ARG002
        """Wake the tick loop early — e.g. to pick up a newly-created automation."""
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
        due: list[Automation] = []
        async with self._sf() as session:
            # Lock rows + bump next_run_at before spawning so a crash doesn't re-fire
            result = await session.execute(
                select(Automation)
                .where(
                    Automation.trigger_kind == "schedule",
                    Automation.enabled.is_(True),
                    Automation.next_run_at.isnot(None),
                    Automation.next_run_at <= now,
                )
                .order_by(Automation.next_run_at)
                .limit(50)
                .with_for_update(skip_locked=True)
            )
            due = list(result.scalars().all())
            for automation in due:
                try:
                    automation.next_run_at = self._compute_next(
                        automation.schedule_cron or "",
                        automation.schedule_timezone or "UTC",
                        now,
                    )
                except Exception:
                    logger.exception(
                        "failed to compute next_run_at for automation %s", automation.id
                    )
                    # Shift forward by 1 hour so we don't tight-loop on a bad cron
                    automation.next_run_at = now + timedelta(hours=1)
            await session.commit()

        if due:
            logger.info("scheduler.tick claimed=%d", len(due))

        for automation in due:
            # Re-query a fresh detached copy so we don't hit stale session issues
            await self._spawn(automation, fired_at=now)

    # ── Spawn ───────────────────────────────────────────────────

    async def _spawn(self, automation: Automation, *, fired_at: datetime) -> None:
        try:
            await self._do_spawn(automation, fired_at=fired_at)
        except Exception as exc:
            logger.exception("scheduler.spawn automation=%s status=error", automation.id)
            await self._repo.record_run(
                project_id=automation.project_id,
                automation_id=automation.id,
                trigger_kind="schedule",
                status="error",
                error=str(exc),
            )

    async def _do_spawn(self, automation: Automation, *, fired_at: datetime) -> None:
        if self._context_builder is None:
            msg = "no scheduled context builder registered"
            raise RuntimeError(msg)
        context = await self._context_builder.build(
            project_id=automation.project_id,
            automation=automation,
            fired_at=fired_at,
        )

        # Installation handle: strictly match the trigger_repo's owner prefix.
        # The scheduler must never silently fall back to an unrelated
        # installation — GitHub will 404 and the box will fail with an
        # opaque error. Record a clear error run instead.
        owner = (automation.trigger_repo or "").split("/", 1)[0]
        installations = await self._github_repo.list_installations(automation.project_id)
        db_installation = next(
            (inst for inst in installations if inst.account_login.lower() == owner.lower()),
            None,
        )
        if db_installation is None:
            msg = (
                f"No GitHub installation in this project covers "
                f"'{automation.trigger_repo}'. Install the Codebox App on "
                f"the '{owner}' account, or change the automation's repo."
            )
            await self._repo.record_run(
                project_id=automation.project_id,
                automation_id=automation.id,
                trigger_kind="schedule",
                status="error",
                error=msg,
            )
            logger.error("scheduler.spawn automation=%s %s", automation.id, msg)
            return

        spawn_ctx = SpawnContext(
            project_id=automation.project_id,
            trigger_kind="schedule",
            workspace_mode="pinned",
            box_name=f"[Automation:{automation.name}] scheduled"[:200],
            base_repo=automation.trigger_repo,
            pinned_branch=automation.pinned_branch,
            installation=db_installation,
            variables=context.variables,
        )
        result = await self._spawner.spawn(automation, spawn_ctx)
        if not result.succeeded:
            raise RuntimeError(result.error or "spawner returned no box id")
        await self._repo.record_run(
            project_id=automation.project_id,
            automation_id=automation.id,
            trigger_kind="schedule",
            status="spawned",
            box_id=result.box_id,
        )
        logger.info(
            "scheduler.spawn automation=%s status=spawned box=%s",
            automation.id,
            result.box_id,
        )

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
