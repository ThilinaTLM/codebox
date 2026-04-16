"""Compute domain entities."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class ContainerConfig:
    image: str
    name: str
    extra_env: dict[str, str] = field(default_factory=dict)
    extra_labels: dict[str, str] = field(default_factory=dict)
    cert_mounts: dict[str, dict[str, str]] = field(default_factory=dict)
    network: str | None = None


@dataclass
class ContainerInfo:
    id: str
    name: str
