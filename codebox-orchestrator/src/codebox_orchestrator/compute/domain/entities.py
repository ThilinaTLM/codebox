"""Compute domain entities."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class ContainerConfig:
    image: str
    name: str
    provider: str
    model: str
    api_key: str
    mount_path: str
    extra_env: dict[str, str] = field(default_factory=dict)
    extra_labels: dict[str, str] = field(default_factory=dict)
    cert_mounts: dict[str, dict[str, str]] = field(default_factory=dict)
    tavily_api_key: str | None = None
    network: str | None = None
    base_url: str | None = None


@dataclass
class ContainerInfo:
    id: str
    name: str
    mount_path: str
