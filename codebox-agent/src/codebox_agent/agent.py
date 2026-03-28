"""Agent creation and token extraction utilities."""

import logging
import os

from langchain_openrouter import ChatOpenRouter
from deepagents import create_deep_agent
from deepagents.backends import LocalShellBackend

from codebox_agent.prompts import CORE_SYSTEM_PROMPT
from codebox_agent.tools.status import StatusReporter, build_status_tools
from codebox_agent.tools.web import build_web_tools

logger = logging.getLogger(__name__)


def _build_system_prompt(
    environment_prompt: str | None = None,
    secondary: str | None = None,
) -> str:
    """Combine core, environment, and secondary system prompts.

    The core prompt (capabilities/tools) is always included.
    The environment prompt (runner-specific context) is appended if provided.
    The secondary prompt (task-specific context from the caller) is appended
    if provided.
    """
    parts = [CORE_SYSTEM_PROMPT]
    if environment_prompt:
        parts.append(environment_prompt)
    if secondary:
        parts.append(secondary)
    return "\n\n".join(parts)


def create_agent(
    model: str,
    api_key: str,
    environment_prompt: str | None = None,
    secondary_system_prompt: str | None = None,
    root_dir: str = "/workspace",
    sandbox_config: dict | None = None,
    checkpointer=None,
    status_reporter: StatusReporter | None = None,
):
    """Create a deep agent with the given configuration.

    Args:
        model: The OpenRouter model identifier.
        api_key: The OpenRouter API key.
        environment_prompt: Optional runner-specific environment prompt appended
            after the core prompt (e.g. sandbox or GitHub Actions context).
        secondary_system_prompt: Optional task-specific prompt appended after
            the environment prompt.
        root_dir: Root directory for the shell backend.
        sandbox_config: Optional dict with keys: temperature, timeout, recursion_limit.
        checkpointer: Optional LangGraph checkpointer for persisting agent state.
        status_reporter: Optional StatusReporter for the set_status tool.

    Returns:
        A compiled LangGraph agent.
    """
    cfg = sandbox_config or {}
    temperature = cfg.get("temperature", 0)
    timeout = cfg.get("timeout", 120)

    logger.info(
        "Creating agent: model=%s, temperature=%s, timeout=%s, root_dir=%s, env_prompt=%s, secondary_prompt=%s",
        model, temperature, timeout, root_dir, bool(environment_prompt), bool(secondary_system_prompt),
    )

    llm = ChatOpenRouter(
        model=model,
        temperature=temperature,
        api_key=api_key,
    )

    backend = LocalShellBackend(
        root_dir=root_dir,
        virtual_mode=False,
        timeout=timeout,
        inherit_env=True,
    )

    tools = build_web_tools()
    if status_reporter is not None:
        tools += build_status_tools(status_reporter)

    return create_deep_agent(
        model=llm,
        tools=tools,
        backend=backend,
        system_prompt=_build_system_prompt(environment_prompt, secondary_system_prompt),
        checkpointer=checkpointer,
    )


def extract_token(chunk) -> str:
    """Extract text content from a streaming chunk.

    Handles both string and list-of-dict content formats.
    """
    if isinstance(chunk.content, str):
        return chunk.content
    elif isinstance(chunk.content, list):
        return "".join(
            b.get("text", "")
            for b in chunk.content
            if isinstance(b, dict)
        )
    return ""
