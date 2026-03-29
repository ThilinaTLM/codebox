"""GitHub integration domain entities."""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime


def _new_uuid() -> str:
    return str(uuid.uuid4())


@dataclass
class GitHubInstallation:
    id: str = field(default_factory=_new_uuid)
    installation_id: int = 0
    account_login: str = ""
    account_type: str = "User"
    settings: str | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))


@dataclass
class GitHubEvent:
    id: str = field(default_factory=_new_uuid)
    delivery_id: str = ""
    event_type: str = ""
    action: str = ""
    repository: str = ""
    payload: str = ""
    box_id: str | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
