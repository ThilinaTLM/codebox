"""Reconnection backoff helpers used by the sandbox's outbound clients.

Both the gRPC callback client (``callback.py``) and the WebSocket tunnel
connector (``tunnel/connector.py``) need to reconnect to the orchestrator
with the same exponential-backoff semantics. This module provides a small
stateful ``Backoff`` helper so the two reconnection loops cannot drift
apart in their constants or formula.

Example::

    backoff = Backoff()
    while True:
        try:
            await _connect()
            backoff.reset()  # successful connection
        except ConnectionError:
            await backoff.sleep()
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field

DEFAULT_BASE_DELAY_S = 1.0
DEFAULT_MAX_DELAY_S = 30.0
DEFAULT_FACTOR = 2.0


@dataclass
class Backoff:
    """Exponential backoff with a configurable ceiling.

    The instance carries a single ``current`` delay that doubles on each
    call to :meth:`next_delay` (or :meth:`sleep`) up to ``ceiling``.
    Call :meth:`reset` after a successful operation to start over.
    """

    base: float = DEFAULT_BASE_DELAY_S
    ceiling: float = DEFAULT_MAX_DELAY_S
    factor: float = DEFAULT_FACTOR
    _current: float = field(init=False)

    def __post_init__(self) -> None:
        self._current = self.base

    def peek(self) -> float:
        """Return the delay that the next :meth:`next_delay` call will return."""
        return self._current

    def next_delay(self) -> float:
        """Return the next delay (seconds) and advance the schedule."""
        delay = self._current
        self._current = min(self._current * self.factor, self.ceiling)
        return delay

    def reset(self) -> None:
        """Reset to the initial delay (call after a successful operation)."""
        self._current = self.base

    async def sleep(self) -> float:
        """Sleep for :meth:`next_delay` seconds and return the slept duration."""
        delay = self.next_delay()
        await asyncio.sleep(delay)
        return delay


__all__ = [
    "DEFAULT_BASE_DELAY_S",
    "DEFAULT_FACTOR",
    "DEFAULT_MAX_DELAY_S",
    "Backoff",
]
