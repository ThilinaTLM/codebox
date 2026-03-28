"""Agent communication domain entities."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone


@dataclass
class PendingRequest:
    """Tracks an in-flight request to a sandbox."""

    request_id: str
    box_id: str
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
