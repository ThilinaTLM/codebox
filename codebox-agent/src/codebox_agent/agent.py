"""Agent creation and token extraction utilities."""

import logging

from deepagents import create_deep_agent
from deepagents.backends import LocalShellBackend

from codebox_agent.llm import LLMProviderConfig, create_chat_model
from codebox_agent.prompts import CORE_SYSTEM_PROMPT
from codebox_agent.tools.status import StatusReporter, build_status_tools
from codebox_agent.tools.web import build_web_tools

logger = logging.getLogger(__name__)


def _build_system_prompt(
    environment_system_prompt: str | None = None,
    dynamic_system_prompt: str | None = None,
) -> str:
    """Combine core, environment, and dynamic system prompts.

    The core prompt (capabilities/tools) is always included.
    The environment prompt (runner-specific context) is appended if provided.
    The dynamic prompt (caller-provided context) is appended if provided.
    """
    parts = [CORE_SYSTEM_PROMPT]
    if environment_system_prompt:
        parts.append(environment_system_prompt)
    if dynamic_system_prompt:
        parts.append(dynamic_system_prompt)
    return "\n\n".join(parts)


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
    status_reporter: StatusReporter | None = None,
):
    """Create a deep agent with the given configuration.

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
        "Creating agent: provider=%s, model=%s, temperature=%s, timeout=%s, root_dir=%s,"
        " env_prompt=%s, dynamic_prompt=%s",
        provider,
        model,
        temperature,
        timeout,
        root_dir,
        bool(environment_system_prompt),
        bool(dynamic_system_prompt),
    )

    llm = create_chat_model(
        LLMProviderConfig(
            provider=provider,
            model=model,
            api_key=api_key,
            base_url=base_url,
        ),
        temperature=temperature,
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
        system_prompt=_build_system_prompt(environment_system_prompt, dynamic_system_prompt),
        checkpointer=checkpointer,
    )


def extract_token(chunk) -> str:
    """Extract text content from a streaming chunk.

    Handles both string and list-of-dict content formats.
    """
    if isinstance(chunk.content, str):
        return chunk.content
    if isinstance(chunk.content, list):
        return "".join(b.get("text", "") for b in chunk.content if isinstance(b, dict))
    return ""
