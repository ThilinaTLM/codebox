"""Unit tests for OrphanScanService."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

import pytest

from codebox_orchestrator.compute.docker.docker_service import ContainerInfo
from codebox_orchestrator.platform.application.orphan_scan import OrphanScanService


@dataclass
class FakeBoxRecord:
    id: str
    deleted_at: datetime | None = None


class FakeBoxRepository:
    def __init__(self, records: dict[str, FakeBoxRecord] | None = None) -> None:
        self._records = records or {}

    async def get_many(
        self, box_ids, *, include_deleted: bool = False
    ) -> dict[str, FakeBoxRecord]:
        out: dict[str, FakeBoxRecord] = {}
        for bid in box_ids:
            rec = self._records.get(bid)
            if rec is None:
                continue
            if not include_deleted and rec.deleted_at is not None:
                continue
            out[bid] = rec
        return out


@dataclass
class FakeRuntime:
    containers: list[ContainerInfo] = field(default_factory=list)
    removed: list[str] = field(default_factory=list)

    def list_containers(self) -> list[ContainerInfo]:
        return list(self.containers)

    def remove(self, container_id_or_name: str) -> None:
        self.removed.append(container_id_or_name)
        self.containers = [
            c for c in self.containers if container_id_or_name not in (c.id, c.name)
        ]


def _container(
    *,
    id: str,  # noqa: A002
    name: str,
    box_id: str = "",
    status: str = "running",
    created_at: str | None = "2024-01-01T00:00:00Z",
) -> ContainerInfo:
    return ContainerInfo(
        id=id,
        name=name,
        status=status,
        image="codebox-sandbox:latest",
        created_at=created_at,
        box_id=box_id,
        box_name=f"box-{box_id[:4]}" if box_id else "",
        project_id="proj-1" if box_id else "",
        trigger="manual" if box_id else "",
    )


_NOW = datetime(2024, 6, 1, tzinfo=UTC)


def _fixed_clock() -> datetime:
    return _NOW


@pytest.mark.asyncio
async def test_live_box_is_not_orphan():
    runtime = FakeRuntime(containers=[_container(id="c1", name="n1", box_id="b1")])
    repo = FakeBoxRepository({"b1": FakeBoxRecord(id="b1")})
    service = OrphanScanService(
        runtime=runtime, box_repository=repo, grace_seconds=0, clock=_fixed_clock
    )
    assert await service.list_orphans() == []


@pytest.mark.asyncio
async def test_missing_record_is_orphan_missing():
    runtime = FakeRuntime(containers=[_container(id="c1", name="n1", box_id="b1")])
    repo = FakeBoxRepository({})
    service = OrphanScanService(
        runtime=runtime, box_repository=repo, grace_seconds=0, clock=_fixed_clock
    )
    orphans = await service.list_orphans()
    assert [(o.container_id, o.reason) for o in orphans] == [("c1", "missing")]


@pytest.mark.asyncio
async def test_soft_deleted_record_is_orphan_deleted():
    runtime = FakeRuntime(containers=[_container(id="c1", name="n1", box_id="b1")])
    repo = FakeBoxRepository({"b1": FakeBoxRecord(id="b1", deleted_at=_NOW - timedelta(days=1))})
    service = OrphanScanService(
        runtime=runtime, box_repository=repo, grace_seconds=0, clock=_fixed_clock
    )
    orphans = await service.list_orphans()
    assert [(o.container_id, o.reason) for o in orphans] == [("c1", "deleted")]


@pytest.mark.asyncio
async def test_unlabeled_container_is_orphan_unlabeled():
    runtime = FakeRuntime(containers=[_container(id="c1", name="n1")])
    repo = FakeBoxRepository({})
    service = OrphanScanService(
        runtime=runtime, box_repository=repo, grace_seconds=0, clock=_fixed_clock
    )
    orphans = await service.list_orphans()
    assert [(o.container_id, o.reason) for o in orphans] == [("c1", "unlabeled")]


@pytest.mark.asyncio
async def test_grace_period_hides_recent_orphan():
    recent = (_NOW - timedelta(seconds=10)).isoformat().replace("+00:00", "Z")
    runtime = FakeRuntime(
        containers=[_container(id="c1", name="n1", box_id="b1", created_at=recent)]
    )
    repo = FakeBoxRepository({})
    service = OrphanScanService(
        runtime=runtime, box_repository=repo, grace_seconds=60, clock=_fixed_clock
    )
    assert await service.list_orphans() == []


@pytest.mark.asyncio
async def test_grace_period_includes_older_orphan():
    old = (_NOW - timedelta(seconds=120)).isoformat().replace("+00:00", "Z")
    runtime = FakeRuntime(containers=[_container(id="c1", name="n1", box_id="b1", created_at=old)])
    repo = FakeBoxRepository({})
    service = OrphanScanService(
        runtime=runtime, box_repository=repo, grace_seconds=60, clock=_fixed_clock
    )
    orphans = await service.list_orphans()
    assert len(orphans) == 1
    assert orphans[0].reason == "missing"


@pytest.mark.asyncio
async def test_docker_nanosecond_timestamp_parses():
    # Docker emits nanosecond precision with a Z suffix.
    ts = "2024-05-31T23:59:00.123456789Z"  # 1 minute before _NOW
    runtime = FakeRuntime(containers=[_container(id="c1", name="n1", box_id="b1", created_at=ts)])
    repo = FakeBoxRepository({})
    service = OrphanScanService(
        runtime=runtime, box_repository=repo, grace_seconds=30, clock=_fixed_clock
    )
    # Container is 60s old; grace is 30s, so it should appear as an orphan.
    orphans = await service.list_orphans()
    assert len(orphans) == 1


@pytest.mark.asyncio
async def test_delete_orphan_removes_from_runtime():
    runtime = FakeRuntime(containers=[_container(id="c1", name="n1", box_id="b1")])
    repo = FakeBoxRepository({})
    service = OrphanScanService(
        runtime=runtime, box_repository=repo, grace_seconds=0, clock=_fixed_clock
    )
    await service.delete_orphan("c1")
    assert runtime.removed == ["c1"]


@pytest.mark.asyncio
async def test_delete_orphan_rejects_live_box():
    runtime = FakeRuntime(containers=[_container(id="c1", name="n1", box_id="b1")])
    repo = FakeBoxRepository({"b1": FakeBoxRecord(id="b1")})
    service = OrphanScanService(
        runtime=runtime, box_repository=repo, grace_seconds=0, clock=_fixed_clock
    )
    with pytest.raises(ValueError, match="no longer orphaned"):
        await service.delete_orphan("c1")
    assert runtime.removed == []


@pytest.mark.asyncio
async def test_delete_orphan_missing_container_raises():
    runtime = FakeRuntime(containers=[])
    repo = FakeBoxRepository({})
    service = OrphanScanService(
        runtime=runtime, box_repository=repo, grace_seconds=0, clock=_fixed_clock
    )
    with pytest.raises(ValueError, match="not found"):
        await service.delete_orphan("c-missing")


@pytest.mark.asyncio
async def test_delete_orphan_accepts_name_as_identifier():
    runtime = FakeRuntime(containers=[_container(id="c1", name="box-abc", box_id="")])
    repo = FakeBoxRepository({})
    service = OrphanScanService(
        runtime=runtime, box_repository=repo, grace_seconds=0, clock=_fixed_clock
    )
    await service.delete_orphan("box-abc")
    assert runtime.removed == ["c1"]


@pytest.mark.asyncio
async def test_list_orphans_sorted_by_created_at_desc():
    older = "2024-01-01T00:00:00Z"
    newer = "2024-02-01T00:00:00Z"
    runtime = FakeRuntime(
        containers=[
            _container(id="c_old", name="old", box_id="missing-old", created_at=older),
            _container(id="c_new", name="new", box_id="missing-new", created_at=newer),
        ]
    )
    repo = FakeBoxRepository({})
    service = OrphanScanService(
        runtime=runtime, box_repository=repo, grace_seconds=0, clock=_fixed_clock
    )
    orphans = await service.list_orphans()
    assert [o.container_id for o in orphans] == ["c_new", "c_old"]
