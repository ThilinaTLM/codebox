"""Agent creation and token extraction utilities."""

import os

from langchain_openrouter import ChatOpenRouter
from deepagents import create_deep_agent
from deepagents.backends import LocalShellBackend

from codebox_daemon.tools.web import build_web_tools


# Primary system prompt — always included. Describes the sandbox environment,
# available tools, and package installation guidance.
PRIMARY_SYSTEM_PROMPT = (
    "You are a helpful coding assistant running inside a sandboxed container. "
    "You have access to tools for filesystem operations "
    "(ls, read_file, write_file, edit_file, glob, grep), "
    "shell execution (execute), and web access "
    "(web_search, web_fetch). Use them to help the user with coding tasks.\n\n"
    "Environment:\n"
    "- Working directory: /workspace\n"
    "- Python 3.12 (with uv), Node.js 20, Go 1.22 are pre-installed\n"
    "- Package managers: pnpm, yarn, npm/npx (Node); pip, uv (Python); go install (Go)\n"
    "- Build tools: make, gcc\n"
    "- CLI utilities: git, gh, ripgrep (rg), fd, tree, jq, curl, unzip, openssh\n\n"
    "Installing packages:\n"
    "- This is a fully disposable sandbox — install anything you need without hesitation. "
    "There is nothing to break and no approval needed.\n"
    "- `devbox add <pkg>` — preferred for language runtimes and CLI tools "
    "(e.g. `devbox add ruby`, `devbox add rustup`)\n"
    "- `apt-get install -y <pkg>` — for system-level libraries and packages\n"
    "- `pip install` / `uv pip install` — for Python packages\n"
    "- `pnpm install` / `yarn install` / `npm install` — for Node packages\n\n"
    "Always install the dependencies a project needs before trying to build or run it. "
    "If a command fails due to a missing tool or library, install it and retry."
)


def _build_system_prompt(secondary: str | None = None) -> str:
    """Combine primary and secondary system prompts.

    The primary prompt (environment/tools) is always included.
    The secondary prompt (task-specific context from the orchestrator) is appended
    if provided.
    """
    if secondary:
        return PRIMARY_SYSTEM_PROMPT + "\n\n" + secondary
    return PRIMARY_SYSTEM_PROMPT


def create_agent(
    model: str,
    api_key: str,
    secondary_system_prompt: str | None = None,
    root_dir: str = "/workspace",
    sandbox_config: dict | None = None,
    checkpointer=None,
):
    """Create a deep agent with the given configuration.

    Args:
        model: The OpenRouter model identifier.
        api_key: The OpenRouter API key.
        secondary_system_prompt: Optional task-specific prompt appended to the
            primary environment prompt.
        root_dir: Root directory for the shell backend.
        sandbox_config: Optional dict with keys: temperature, timeout, recursion_limit.
        checkpointer: Optional LangGraph checkpointer for persisting agent state.

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
        system_prompt=_build_system_prompt(secondary_system_prompt),
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
