"""Tests for the exponential-backoff helper used by callback and tunnel reconnect loops."""

from __future__ import annotations

import asyncio

import pytest

from codebox_sandbox.retry import (
    DEFAULT_BASE_DELAY_S,
    DEFAULT_MAX_DELAY_S,
    Backoff,
)


def test_default_first_delay_matches_base() -> None:
    backoff = Backoff()
    assert backoff.peek() == DEFAULT_BASE_DELAY_S


def test_next_delay_doubles_then_caps_at_ceiling() -> None:
    backoff = Backoff(base=1.0, ceiling=8.0, factor=2.0)
    schedule = [backoff.next_delay() for _ in range(6)]
    # First six slots: 1, 2, 4, 8, 8, 8 (cap)
    assert schedule == [1.0, 2.0, 4.0, 8.0, 8.0, 8.0]


def test_reset_returns_to_base() -> None:
    backoff = Backoff(base=1.0, ceiling=8.0)
    backoff.next_delay()
    backoff.next_delay()
    assert backoff.peek() == 4.0
    backoff.reset()
    assert backoff.peek() == 1.0


def test_peek_does_not_advance() -> None:
    backoff = Backoff(base=1.0, ceiling=8.0)
    assert backoff.peek() == 1.0
    assert backoff.peek() == 1.0
    assert backoff.next_delay() == 1.0
    assert backoff.peek() == 2.0


def test_custom_factor() -> None:
    backoff = Backoff(base=1.0, ceiling=100.0, factor=3.0)
    assert backoff.next_delay() == 1.0
    assert backoff.next_delay() == 3.0
    assert backoff.next_delay() == 9.0
    assert backoff.next_delay() == 27.0


@pytest.mark.asyncio
async def test_sleep_returns_delay_and_advances(monkeypatch: pytest.MonkeyPatch) -> None:
    slept: list[float] = []

    async def fake_sleep(seconds: float) -> None:
        slept.append(seconds)

    monkeypatch.setattr(asyncio, "sleep", fake_sleep)
    backoff = Backoff(base=1.0, ceiling=4.0)
    assert await backoff.sleep() == 1.0
    assert await backoff.sleep() == 2.0
    assert await backoff.sleep() == 4.0
    assert slept == [1.0, 2.0, 4.0]


def test_ceiling_default_is_30s() -> None:
    assert DEFAULT_MAX_DELAY_S == 30.0
