"""Agent creation and token extraction utilities."""

import os

from langchain_openrouter import ChatOpenRouter
from deepagents import create_deep_agent
from deepagents.backends import LocalShellBackend

from codebox_daemon.tools.web import build_web_tools


DEFAULT_SYSTEM_PROMPT = (
    "You are a helpful coding assistant running inside a sandboxed container. "
    "You have access to tools for filesystem operations "
    "(ls, read_file, write_file, edit_file, glob, grep), "
    "shell execution (execute), and web access "
    "(web_search, web_fetch). Use them to help the user with coding tasks.\n\n"
    "Environment:\n"
    "- Working directory: /workspace\n"
    "- Python 3.12 (with uv), Node.js 20, Go 1.22 are pre-installed\n"
    "- git, ripgrep (rg), jq, curl are available\n"
    "- Devbox is available — use `devbox add <pkg>` to install additional language "
    "toolchains or CLI tools (preferred over apt for dev tools)\n"
    "- apt is available — use `apt-get install -y <pkg>` for system-level packages\n"
    "- pip and uv are available for Python packages; npm/npx for Node packages\n\n"
    "You are inside a disposable sandbox. Install any packages the task requires "
    "without hesitation — there is nothing to break."
)


def create_agent(
    model: str,
    api_key: str,
    system_prompt: str | None = None,
    root_dir: str = "/workspace",
    sandbox_config: dict | None = None,
):
    """Create a deep agent with the given configuration.

    Args:
        model: The OpenRouter model identifier.
        api_key: The OpenRouter API key.
        system_prompt: Optional custom system prompt.
        root_dir: Root directory for the shell backend.
        sandbox_config: Optional dict with keys: temperature, timeout, recursion_limit.

    Returns:
        A compiled LangGraph agent.
    """
    cfg = sandbox_config or {}
    temperature = cfg.get("temperature", 0)
    timeout = cfg.get("timeout", 120)

    llm = ChatOpenRouter(
        model=model,
        temperature=temperature,
        api_key=api_key,
    )

    backend = LocalShellBackend(
        root_dir=root_dir,
        virtual_mode=True,
        timeout=timeout,
        inherit_env=True,
    )

    return create_deep_agent(
        model=llm,
        tools=build_web_tools(),
        backend=backend,
        system_prompt=system_prompt or DEFAULT_SYSTEM_PROMPT,
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
