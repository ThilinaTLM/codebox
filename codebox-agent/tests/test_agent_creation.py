"""Tests for config-driven agent creation.

These tests mock ``create_deep_agent`` to verify that the correct arguments
are passed based on the config — we don't need a real LLM or filesystem.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from codebox_agent.agent import _build_system_prompt, create_agent_from_config
from codebox_agent.config import (
    AgentConfig,
    FilesystemToolConfig,
    LLMConfig,
    ToolsConfig,
    WebFetchToolConfig,
    WebSearchToolConfig,
)
from codebox_agent.prompts import CORE_SYSTEM_PROMPT

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_config(**tool_overrides) -> AgentConfig:
    tools_kw = {}
    tools_kw.update(tool_overrides)
    return AgentConfig(
        llm=LLMConfig(provider="openai", model="gpt-4o", api_key="sk-test"),
        tools=ToolsConfig(**tools_kw),
    )


# ---------------------------------------------------------------------------
# System prompt assembly
# ---------------------------------------------------------------------------


class TestBuildSystemPrompt:
    def test_default_uses_core(self):
        result = _build_system_prompt()
        assert result == CORE_SYSTEM_PROMPT

    def test_custom_replaces_core(self):
        result = _build_system_prompt("Custom prompt.")
        assert result == "Custom prompt."
        assert CORE_SYSTEM_PROMPT not in result

    def test_environment_prompt_appended(self):
        result = _build_system_prompt(None, "Env context.")
        assert result.startswith(CORE_SYSTEM_PROMPT)
        assert "Env context." in result

    def test_custom_plus_environment(self):
        result = _build_system_prompt("Custom.", "Env.")
        assert result == "Custom.\n\nEnv."


# ---------------------------------------------------------------------------
# create_agent_from_config — tool / backend wiring
# ---------------------------------------------------------------------------


class TestCreateAgentFromConfig:
    @patch("codebox_agent.agent.create_deep_agent")
    @patch("codebox_agent.agent.create_chat_model")
    def test_default_config_passes_backend_and_web_tools(self, mock_llm, mock_deep_agent):
        mock_llm.return_value = MagicMock()
        mock_deep_agent.return_value = MagicMock()

        config = _make_config()
        create_agent_from_config(config=config)

        call_kwargs = mock_deep_agent.call_args
        # Backend should be provided (filesystem enabled)
        assert call_kwargs.kwargs.get("backend") is not None
        # Custom tools should include web_search and web_fetch
        tools = call_kwargs.kwargs.get("tools") or []
        tool_names = {t.name for t in tools}
        assert "web_search" in tool_names
        assert "web_fetch" in tool_names

    @patch("codebox_agent.agent.create_deep_agent")
    @patch("codebox_agent.agent.create_chat_model")
    def test_filesystem_disabled_passes_no_backend(self, mock_llm, mock_deep_agent):
        mock_llm.return_value = MagicMock()
        mock_deep_agent.return_value = MagicMock()

        config = _make_config(filesystem=FilesystemToolConfig(enabled=False))
        create_agent_from_config(config=config)

        call_kwargs = mock_deep_agent.call_args
        assert call_kwargs.kwargs.get("backend") is None

    @patch("codebox_agent.agent.create_deep_agent")
    @patch("codebox_agent.agent.create_chat_model")
    def test_web_tools_disabled(self, mock_llm, mock_deep_agent):
        mock_llm.return_value = MagicMock()
        mock_deep_agent.return_value = MagicMock()

        config = _make_config(
            web_search=WebSearchToolConfig(enabled=False),
            web_fetch=WebFetchToolConfig(enabled=False),
        )
        create_agent_from_config(config=config)

        call_kwargs = mock_deep_agent.call_args
        # tools should be None (empty list converted to None)
        assert call_kwargs.kwargs.get("tools") is None

    @patch("codebox_agent.agent.create_deep_agent")
    @patch("codebox_agent.agent.create_chat_model")
    def test_custom_system_prompt(self, mock_llm, mock_deep_agent):
        mock_llm.return_value = MagicMock()
        mock_deep_agent.return_value = MagicMock()

        config = AgentConfig(
            llm=LLMConfig(provider="openai", model="gpt-4o", api_key="sk-test"),
            system_prompt="You are a security expert.",
        )
        create_agent_from_config(config=config, environment_system_prompt="Sandbox env.")

        call_kwargs = mock_deep_agent.call_args
        prompt = call_kwargs.kwargs.get("system_prompt", "")
        assert "You are a security expert." in prompt
        assert "Sandbox env." in prompt
        assert CORE_SYSTEM_PROMPT not in prompt

    @patch("codebox_agent.agent.create_deep_agent")
    @patch("codebox_agent.agent.create_chat_model")
    def test_default_system_prompt_when_none(self, mock_llm, mock_deep_agent):
        mock_llm.return_value = MagicMock()
        mock_deep_agent.return_value = MagicMock()

        config = _make_config()
        create_agent_from_config(config=config)

        call_kwargs = mock_deep_agent.call_args
        prompt = call_kwargs.kwargs.get("system_prompt", "")
        assert CORE_SYSTEM_PROMPT in prompt
