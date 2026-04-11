"""Agent creation and token extraction utilities."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from deepagents import create_deep_agent

from codebox_agent.llm import LLMProviderConfig, create_chat_model
from codebox_agent.prompts import CORE_SYSTEM_PROMPT
from codebox_agent.streaming_backend import StreamingShellBackend
from codebox_agent.tools.web import build_web_tools

if TYPE_CHECKING:
    from codebox_agent.config import AgentConfig

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# System prompt assembly (Option C)
# ---------------------------------------------------------------------------


def _build_system_prompt(
    core_or_custom: str | None = None,
    environment_system_prompt: str | None = None,
) -> str:
    """Combine the core (or custom) prompt with the runner-provided environment prompt.

    * When *core_or_custom* is ``None`` the built-in ``CORE_SYSTEM_PROMPT`` is
      used.
    * The *environment_system_prompt* (sandbox / GitHub-Actions context) is
      always appended when provided — it is factual runtime information, not
      agent identity.
    * The deepagents ``BASE_AGENT_PROMPT`` is appended automatically by
      ``create_deep_agent()`` — we do **not** add it here.
    """
    parts = [core_or_custom or CORE_SYSTEM_PROMPT]
    if environment_system_prompt:
        parts.append(environment_system_prompt)
    return "\n\n".join(parts)


# ---------------------------------------------------------------------------
# Config-driven agent creation (new primary path)
# ---------------------------------------------------------------------------


def create_agent_from_config(
    *,
    config: AgentConfig,
    environment_system_prompt: str | None = None,
    root_dir: str = "/workspace",
    checkpointer=None,
):
    """Create a deep agent from a validated :class:`AgentConfig`.

    This is the preferred entry point.  The legacy :func:`create_agent`
    function delegates here after building a config from its positional args.

    Returns:
        A compiled LangGraph agent.
    """
    tc = config.tools

    logger.info(
        "Creating agent from config: provider=%s, model=%s, "
        "root_dir=%s, system_prompt=%s, recursion_limit=%d",
        config.llm.provider,
        config.llm.model,
        root_dir,
        "custom" if config.system_prompt else "default",
        config.recursion_limit,
    )

    # -- LLM -----------------------------------------------------------------
    llm = create_chat_model(
        LLMProviderConfig(
            provider=config.llm.provider,
            model=config.llm.model,
            api_key=config.llm.api_key,
            base_url=config.llm.base_url,
        ),
    )

    # -- Backend (filesystem + shell) ----------------------------------------
    # When filesystem tools are disabled we pass backend=None so that
    # deepagents' FilesystemMiddleware degrades gracefully (no file/shell
    # tools).  When only execute is disabled we still pass the backend (needed
    # for filesystem) — the execute tool will remain available since deepagents
    # has no per-tool toggle; we log a warning below.
    backend = None
    if tc.filesystem.enabled:
        backend = StreamingShellBackend(
            root_dir=root_dir,
            virtual_mode=False,
            timeout=tc.execute.timeout,
            inherit_env=True,
        )
        if not tc.execute.enabled:
            logger.warning(
                "tools.execute.enabled=False is not fully supported in v1: "
                "the execute tool will still be present because deepagents' "
                "FilesystemMiddleware always includes it when a backend is "
                "provided.  To remove execute, disable the entire filesystem "
                "tool group (tools.filesystem.enabled=False)."
            )
    else:
        logger.info("Filesystem tools disabled — backend=None")

    # -- Custom (web) tools --------------------------------------------------
    tools = build_web_tools(tc)

    # -- System prompt -------------------------------------------------------
    system_prompt = _build_system_prompt(config.system_prompt, environment_system_prompt)

    # -- Middleware -----------------------------------------------------------
    # deepagents always adds TodoListMiddleware, FilesystemMiddleware, and
    # SubAgentMiddleware.  We can only *add* extra middleware, not remove
    # defaults.
    extra_middleware: list = []

    if not tc.task.enabled:
        logger.warning(
            "tools.task.enabled=False is not fully supported in v1: "
            "the task tool will still be present because deepagents always "
            "includes SubAgentMiddleware in the default stack."
        )

    # compact_conversation is opt-in — not in deepagents' default stack.
    # It requires a reference to the auto-summarization middleware that
    # deepagents creates internally, so we cannot easily add it from the
    # outside.  Log a warning for now.
    if tc.compact_conversation.enabled:
        logger.warning(
            "tools.compact_conversation.enabled=True is not yet supported: "
            "SummarizationToolMiddleware requires a reference to the internal "
            "SummarizationMiddleware instance created by deepagents.  This "
            "will be addressed in a future deepagents release."
        )

    # -- Assemble graph ------------------------------------------------------
    return create_deep_agent(
        model=llm,
        tools=tools or None,
        backend=backend,
        system_prompt=system_prompt,
        middleware=extra_middleware or (),
        checkpointer=checkpointer,
    )


# ---------------------------------------------------------------------------
# Legacy interface (backward-compatible wrapper)
# ---------------------------------------------------------------------------


def create_agent(
    provider: str,
    model: str,
    api_key: str,
    base_url: str | None = None,
    environment_system_prompt: str | None = None,
    dynamic_system_prompt: str | None = None,
    root_dir: str = "/workspace",
    sandbox_config: dict | None = None,
    checkpointer=None,
):
    """Create a deep agent with the given configuration.

    .. deprecated::
        Prefer :func:`create_agent_from_config` with an :class:`AgentConfig`.
        This wrapper exists for backward compatibility with callers that have
        not yet migrated to the config-driven API.

    Args:
        provider: The LLM provider identifier.
        model: The LLM model identifier.
        api_key: The LLM API key.
        base_url: Optional provider base URL override.
        environment_system_prompt: Optional runner-specific environment prompt
            appended after the core prompt (e.g. sandbox or GitHub Actions context).
        dynamic_system_prompt: Optional caller-provided prompt appended after
            the environment prompt (e.g. from orchestrator or workflow config).
        root_dir: Root directory for the shell backend.
        sandbox_config: Optional dict with keys: timeout, recursion_limit.
        checkpointer: Optional LangGraph checkpointer for persisting agent state.

    Returns:
        A compiled LangGraph agent.
    """
    from codebox_agent.config import AgentConfig, LLMConfig  # noqa: PLC0415

    cfg = sandbox_config or {}

    config = AgentConfig(
        llm=LLMConfig(
            provider=provider,
            model=model,
            api_key=api_key,
            base_url=base_url,
        ),
        system_prompt=dynamic_system_prompt,
        recursion_limit=int(cfg.get("recursion_limit", 150)),
    )

    return create_agent_from_config(
        config=config,
        environment_system_prompt=environment_system_prompt,
        root_dir=root_dir,
        checkpointer=checkpointer,
    )


# ---------------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------------


def extract_token(chunk) -> str:
    """Extract text content from a streaming chunk.

    Handles both string and list-of-dict content formats.
    """
    if isinstance(chunk.content, str):
        return chunk.content
    if isinstance(chunk.content, list):
        return "".join(b.get("text", "") for b in chunk.content if isinstance(b, dict))
    return ""
