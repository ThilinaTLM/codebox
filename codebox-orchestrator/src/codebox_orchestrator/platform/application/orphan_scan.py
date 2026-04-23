"""Orphan sandbox container detection and cleanup.

An orphan is a container labelled ``codebox-sandbox=true`` that does not map
to a live ``BoxRecord``. See the plan in
``/home/tlm/.pi/plans/orphaned-sandbox-containers.md`` for the full
classification rules.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from codebox_orchestrator.platform.domain.views import OrphanContainerView, OrphanReason

if TYPE_CHECKING:
    from collections.abc import Callable

    from codebox_orchestrator.box.infrastructure.box_repository import BoxRepository
    from codebox_orchestrator.compute.docker.docker_adapter import DockerRuntime
    from codebox_orchestrator.compute.docker.docker_service import (
        ContainerInfo as RuntimeContainerInfo,
    )

logger = logging.getLogger(__name__)


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _parse_iso(value: str | None) -> datetime | None:
    """Parse an RFC3339/ISO8601 timestamp, tolerating Docker's ``Z`` suffix."""
    if not value:
        return None
    # Docker serialises nanoseconds + ``Z``; Python <3.11 only accepts up to
    # microseconds and needs a +00:00 offset. fromisoformat in 3.12 handles
    # ``Z`` but not nanoseconds — normalise both.
    text = value.replace("Z", "+00:00")
    # Trim fractional seconds to microseconds if present.
    if "." in text:
        head, _, tail = text.partition(".")
        # tail = "123456789+00:00"
        frac, sep, tz = "", "", ""
        for idx, ch in enumerate(tail):
            if ch in "+-":
                frac, sep, tz = tail[:idx], ch, tail[idx:]
                break
        else:
            frac = tail
        frac = frac[:6]  # microseconds
        text = f"{head}.{frac}{sep}{tz}" if frac else f"{head}{sep}{tz}"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed


class OrphanScanService:
    """Classify and clean up orphaned sandbox containers."""

    def __init__(
        self,
        runtime: DockerRuntime,
        box_repository: BoxRepository,
        *,
        grace_seconds: int = 60,
        clock: Callable[[], datetime] = _utcnow,
    ) -> None:
        self._runtime = runtime
        self._box_repository = box_repository
        self._grace_seconds = max(0, grace_seconds)
        self._clock = clock

    async def list_orphans(self) -> list[OrphanContainerView]:
        containers = await asyncio.get_running_loop().run_in_executor(
            None, self._runtime.list_containers
        )
        labelled_box_ids = [c.box_id for c in containers if c.box_id]
        records = await self._box_repository.get_many(labelled_box_ids, include_deleted=True)

        now = self._clock()
        views: list[OrphanContainerView] = []
        for container in containers:
            reason = self._classify(container, records)
            if reason is None:
                continue
            if self._within_grace(container, now):
                continue
            views.append(self._to_view(container, reason))

        views.sort(key=lambda v: v.created_at or "", reverse=True)
        return views

    async def delete_orphan(self, container_id: str) -> None:
        """Remove *container_id* iff it is currently classified as an orphan.

        Raises ``ValueError`` when the container is not present or no longer
        orphaned at delete time (re-classified to guard against races with a
        concurrent admin action or a fresh Box spawn).
        """
        containers = await asyncio.get_running_loop().run_in_executor(
            None, self._runtime.list_containers
        )
        match = next(
            (c for c in containers if container_id in (c.id, c.name)),
            None,
        )
        if match is None:
            raise ValueError(f"Container not found: {container_id}")

        records = await self._box_repository.get_many(
            [match.box_id] if match.box_id else [], include_deleted=True
        )
        reason = self._classify(match, records)
        if reason is None:
            raise ValueError(
                f"Container {match.name} is no longer orphaned; refusing to delete",
            )

        logger.info(
            "Removing orphan container %s (reason=%s, box_id=%s)",
            match.name,
            reason,
            match.box_id or "<unlabeled>",
        )
        await asyncio.get_running_loop().run_in_executor(None, self._runtime.remove, match.id)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _classify(
        container: RuntimeContainerInfo,
        records: dict[str, object],
    ) -> OrphanReason | None:
        if not container.box_id:
            return "unlabeled"
        record = records.get(container.box_id)
        if record is None:
            return "missing"
        if getattr(record, "deleted_at", None) is not None:
            return "deleted"
        return None

    def _within_grace(self, container: RuntimeContainerInfo, now: datetime) -> bool:
        if self._grace_seconds <= 0:
            return False
        created = _parse_iso(container.created_at)
        if created is None:
            # Treat unparseable timestamps as "old" — do not hide real orphans.
            return False
        age = (now - created).total_seconds()
        return age < self._grace_seconds

    @staticmethod
    def _to_view(container: RuntimeContainerInfo, reason: OrphanReason) -> OrphanContainerView:
        return OrphanContainerView(
            container_id=container.id,
            container_name=container.name,
            reason=reason,
            status=container.status,
            image=container.image,
            created_at=container.created_at,
            started_at=container.started_at,
            box_id=container.box_id,
            box_name=container.box_name,
            project_id=container.project_id,
            trigger=container.trigger,
        )
