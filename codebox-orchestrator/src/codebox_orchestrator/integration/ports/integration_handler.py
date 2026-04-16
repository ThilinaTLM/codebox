"""Integration handler port and cross-context DTO."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass
class BoxCreateRequest:
    """Cross-context DTO: what an integration produces for the Box context."""

    name: str
    initial_prompt: str
    system_prompt: str | None = None
    provider: str | None = None
    model: str | None = None
    trigger: str | None = None
    trigger_url: str | None = None
    integration_id: str | None = None
    repo: str | None = None
    branch: str | None = None
    issue_number: int | None = None


class IntegrationHandler(Protocol):
    """Each integration module implements this to process external events."""

    async def process_webhook(
        self, event_type: str, delivery_id: str, payload: dict
    ) -> BoxCreateRequest | None: ...

    def verify_signature(self, payload: bytes, signature: str) -> bool: ...
