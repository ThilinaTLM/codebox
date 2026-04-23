"""Typed, validated agent configuration.

``AgentConfig`` is the single source of truth for every setting that controls
agent creation: LLM parameters, tool availability, tool-specific knobs, and
the optional custom system prompt.

Load from a dict (API-driven)::

    config = AgentConfig.from_dict(json.loads(raw))

Or build from legacy environment variables::

    config = AgentConfig.from_env()
"""

from __future__ import annotations

import logging
import os
from typing import Self

from pydantic import BaseModel, Field, model_validator

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# LLM
# ---------------------------------------------------------------------------

_SUPPORTED_PROVIDERS = ("openai", "openrouter", "opencode-go")


class LLMConfig(BaseModel):
    """LLM provider and model settings."""

    provider: str = Field(description="LLM provider: 'openai', 'openrouter', or 'opencode-go'")
    model: str = Field(description="Model identifier (e.g. 'gpt-4o', 'anthropic/claude-sonnet-4')")
    api_key: str = Field(description="Provider API key")
    base_url: str | None = Field(
        default=None, description="Custom API endpoint (OpenAI-compatible providers)"
    )


# ---------------------------------------------------------------------------
# Per-tool configs
# ---------------------------------------------------------------------------


class ExecuteToolConfig(BaseModel):
    """Shell execution tool settings."""

    enabled: bool = True
    timeout: int = Field(default=120, ge=1, description="Default per-command timeout (seconds)")
    max_timeout: int = Field(default=3600, ge=1, description="Hard cap on per-command timeout")


class WebSearchToolConfig(BaseModel):
    """Web search (Tavily) tool settings."""

    enabled: bool = True
    api_key: str | None = Field(
        default=None,
        description="Tavily API key; falls back to CODEBOX_TAVILY_API_KEY env var",
    )
    max_results: int = Field(default=5, ge=1, le=20)


class WebFetchToolConfig(BaseModel):
    """URL fetch tool settings."""

    enabled: bool = True
    timeout: int = Field(default=30, ge=1, description="HTTP request timeout (seconds)")
    max_length: int = Field(default=50_000, ge=1_000, description="Response truncation (chars)")


class FilesystemToolConfig(BaseModel):
    """Shared config for filesystem tools (ls, read_file, write_file, edit_file, glob, grep).

    These tools are provided as a group by the deepagents ``FilesystemMiddleware``.
    They can only be enabled or disabled together.
    """

    enabled: bool = True
    glob_timeout: float = Field(default=20.0, gt=0)


class TodoToolConfig(BaseModel):
    """``write_todos`` tool settings.

    .. note::
        The deepagents ``TodoListMiddleware`` is always included in the default
        middleware stack.  Setting ``enabled=False`` here is accepted but has
        **no effect** in v1.
    """

    enabled: bool = True


class TaskToolConfig(BaseModel):
    """Subagent ``task`` tool settings."""

    enabled: bool = True


class CompactConversationToolConfig(BaseModel):
    """``compact_conversation`` tool settings."""

    enabled: bool = Field(default=False, description="Off by default (matches current behavior)")


# ---------------------------------------------------------------------------
# Aggregate tools config
# ---------------------------------------------------------------------------


class ToolsConfig(BaseModel):
    """Per-tool configuration.  All tools default to current behaviour when omitted."""

    execute: ExecuteToolConfig = Field(default_factory=ExecuteToolConfig)
    web_search: WebSearchToolConfig = Field(default_factory=WebSearchToolConfig)
    web_fetch: WebFetchToolConfig = Field(default_factory=WebFetchToolConfig)
    filesystem: FilesystemToolConfig = Field(default_factory=FilesystemToolConfig)
    write_todos: TodoToolConfig = Field(default_factory=TodoToolConfig)
    task: TaskToolConfig = Field(default_factory=TaskToolConfig)
    compact_conversation: CompactConversationToolConfig = Field(
        default_factory=CompactConversationToolConfig
    )


# ---------------------------------------------------------------------------
# Top-level config
# ---------------------------------------------------------------------------


class AgentConfig(BaseModel):
    """Complete agent configuration.

    Load from a dict/JSON for API-driven creation, or construct
    programmatically.  All fields have sensible defaults matching current
    behaviour.
    """

    llm: LLMConfig
    system_prompt: str | None = Field(
        default=None,
        description=(
            "Custom system prompt.  When set this *replaces* the built-in "
            "CORE_SYSTEM_PROMPT.  When None the default core prompt is used."
        ),
    )
    recursion_limit: int = Field(default=150, ge=1, le=1000)
    tools: ToolsConfig = Field(default_factory=ToolsConfig)

    # -- validators ----------------------------------------------------------

    @model_validator(mode="after")
    def _cross_field_checks(self) -> Self:
        # Provider must be known.
        if self.llm.provider not in _SUPPORTED_PROVIDERS:
            msg = (
                f"Unknown LLM provider '{self.llm.provider}'. "
                f"Supported: {', '.join(_SUPPORTED_PROVIDERS)}"
            )
            raise ValueError(msg)

        # execute.timeout must not exceed execute.max_timeout.
        ex = self.tools.execute
        if ex.enabled and ex.timeout > ex.max_timeout:
            msg = (
                f"execute.timeout ({ex.timeout}s) exceeds execute.max_timeout ({ex.max_timeout}s)"
            )
            raise ValueError(msg)

        # Warn (don't fail) if web_search is enabled but has no API key.
        # Matches existing graceful-degradation behaviour.
        ws = self.tools.web_search
        if ws.enabled and not ws.api_key and not os.environ.get("CODEBOX_TAVILY_API_KEY"):
            logger.warning(
                "tools.web_search is enabled but no API key is configured. "
                "The tool will return an error at call time."
            )

        return self

    # -- constructors --------------------------------------------------------

    @classmethod
    def from_dict(cls, data: dict) -> AgentConfig:
        """Create from a JSON/YAML-parsed dict.

        Raises ``pydantic.ValidationError`` with clear, actionable messages on
        invalid input.
        """
        return cls.model_validate(data)

    @classmethod
    def from_env(cls) -> AgentConfig:
        """Build a config from environment variables.

        Reads:
            ``CODEBOX_LLM_PROVIDER``  (default: "openai")
            ``CODEBOX_LLM_MODEL``
            ``CODEBOX_LLM_API_KEY``
            ``CODEBOX_LLM_BASE_URL``        (optional, OpenAI-compatible endpoints)
            ``CODEBOX_TAVILY_API_KEY``      (optional)
            ``CODEBOX_AGENT_RECURSION_LIMIT``  (default: 150)
            ``CODEBOX_AGENT_EXECUTE_TIMEOUT``  (default: 120, seconds)

        This entry point is used by the GitHub Action; the sandbox always
        receives the full config as the ``CODEBOX_AGENT_CONFIG`` JSON blob.
        """
        provider = os.environ.get("CODEBOX_LLM_PROVIDER", "openai") or "openai"
        model = os.environ.get("CODEBOX_LLM_MODEL", "")
        api_key = os.environ.get("CODEBOX_LLM_API_KEY", "")
        base_url = os.environ.get("CODEBOX_LLM_BASE_URL") or None
        tavily_key = os.environ.get("CODEBOX_TAVILY_API_KEY")
        recursion_limit = int(os.environ.get("CODEBOX_AGENT_RECURSION_LIMIT", "150") or "150")
        execute_timeout = int(os.environ.get("CODEBOX_AGENT_EXECUTE_TIMEOUT", "120") or "120")

        return cls(
            llm=LLMConfig(
                provider=provider,
                model=model,
                api_key=api_key,
                base_url=base_url,
            ),
            recursion_limit=recursion_limit,
            tools=ToolsConfig(
                execute=ExecuteToolConfig(timeout=execute_timeout),
                web_search=WebSearchToolConfig(api_key=tavily_key),
            ),
        )
