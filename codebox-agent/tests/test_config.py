"""Tests for AgentConfig validation, from_dict, and from_env."""

from __future__ import annotations

import json

import pytest
from pydantic import ValidationError

from codebox_agent.config import AgentConfig

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _minimal_llm(**overrides) -> dict:
    base = {"provider": "openai", "model": "gpt-4o", "api_key": "sk-test"}
    base.update(overrides)
    return base


def _minimal_config(**overrides) -> dict:
    base: dict = {"llm": _minimal_llm()}
    base.update(overrides)
    return base


# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------


class TestDefaults:
    def test_all_tools_enabled_by_default(self):
        cfg = AgentConfig(**_minimal_config())
        assert cfg.tools.execute.enabled is True
        assert cfg.tools.web_search.enabled is True
        assert cfg.tools.web_fetch.enabled is True
        assert cfg.tools.filesystem.enabled is True
        assert cfg.tools.write_todos.enabled is True
        assert cfg.tools.task.enabled is True
        assert cfg.tools.compact_conversation.enabled is False  # opt-in

    def test_default_recursion_limit(self):
        cfg = AgentConfig(**_minimal_config())
        assert cfg.recursion_limit == 150

    def test_default_system_prompt_is_none(self):
        cfg = AgentConfig(**_minimal_config())
        assert cfg.system_prompt is None

    def test_default_execute_timeouts(self):
        cfg = AgentConfig(**_minimal_config())
        assert cfg.tools.execute.timeout == 120
        assert cfg.tools.execute.max_timeout == 3600


# ---------------------------------------------------------------------------
# from_dict
# ---------------------------------------------------------------------------


class TestFromDict:
    def test_minimal_valid(self):
        cfg = AgentConfig.from_dict(_minimal_config())
        assert cfg.llm.provider == "openai"
        assert cfg.llm.model == "gpt-4o"

    def test_round_trip(self):
        original = _minimal_config(
            system_prompt="You are a specialist.",
            recursion_limit=200,
            tools={
                "execute": {"timeout": 60},
                "web_search": {"enabled": False},
            },
        )
        cfg = AgentConfig.from_dict(original)
        assert cfg.system_prompt == "You are a specialist."
        assert cfg.recursion_limit == 200
        assert cfg.tools.execute.timeout == 60
        assert cfg.tools.web_search.enabled is False

    def test_full_config(self):
        data = {
            "llm": {
                "provider": "openrouter",
                "model": "anthropic/claude-sonnet-4",
                "api_key": "sk-or-test",
                "base_url": "https://custom.api",
            },
            "system_prompt": "You are a backend engineer.",
            "recursion_limit": 300,
            "tools": {
                "execute": {"enabled": True, "timeout": 60, "max_timeout": 600},
                "web_search": {"enabled": True, "api_key": "tvly-test", "max_results": 10},
                "web_fetch": {"enabled": False, "timeout": 15, "max_length": 25000},
                "filesystem": {"enabled": True, "glob_timeout": 30.0},
                "write_todos": {"enabled": True},
                "task": {"enabled": False},
                "compact_conversation": {"enabled": True},
            },
        }
        cfg = AgentConfig.from_dict(data)
        assert cfg.tools.web_fetch.enabled is False
        assert cfg.tools.task.enabled is False
        assert cfg.tools.compact_conversation.enabled is True

    def test_missing_llm_raises(self):
        with pytest.raises(ValidationError, match="llm"):
            AgentConfig.from_dict({})

    def test_missing_api_key_raises(self):
        with pytest.raises(ValidationError, match="api_key"):
            AgentConfig.from_dict({"llm": {"provider": "openai", "model": "gpt-4o"}})

    def test_opencode_go_provider_accepted(self):
        cfg = AgentConfig.from_dict(
            {
                "llm": {
                    "provider": "opencode-go",
                    "model": "kimi-k2.6",
                    "api_key": "sk-x",
                },
            }
        )
        assert cfg.llm.provider == "opencode-go"
        assert cfg.llm.model == "kimi-k2.6"

    def test_json_serializable(self):
        """Config can be serialized to JSON and deserialized back."""
        cfg = AgentConfig(**_minimal_config())
        raw = cfg.model_dump_json()
        restored = AgentConfig.from_dict(json.loads(raw))
        assert restored == cfg


# ---------------------------------------------------------------------------
# Validation errors
# ---------------------------------------------------------------------------


class TestValidation:
    def test_unknown_provider(self):
        with pytest.raises(ValidationError, match="Unknown LLM provider 'anthropic'"):
            AgentConfig(**_minimal_config(llm=_minimal_llm(provider="anthropic")))

    def test_execute_timeout_exceeds_max(self):
        with pytest.raises(ValidationError, match="exceeds"):
            AgentConfig(
                **_minimal_config(tools={"execute": {"timeout": 5000, "max_timeout": 3600}})
            )

    def test_recursion_limit_too_low(self):
        with pytest.raises(ValidationError, match="recursion_limit"):
            AgentConfig(**_minimal_config(recursion_limit=0))

    def test_recursion_limit_too_high(self):
        with pytest.raises(ValidationError, match="recursion_limit"):
            AgentConfig(**_minimal_config(recursion_limit=5000))

    def test_negative_timeout(self):
        with pytest.raises(ValidationError, match="timeout"):
            AgentConfig(**_minimal_config(tools={"execute": {"timeout": -1}}))

    def test_web_search_max_results_out_of_range(self):
        with pytest.raises(ValidationError, match="max_results"):
            AgentConfig(**_minimal_config(tools={"web_search": {"max_results": 50}}))


# ---------------------------------------------------------------------------
# from_env
# ---------------------------------------------------------------------------


_LLM_ENV_VARS = (
    "CODEBOX_LLM_PROVIDER",
    "CODEBOX_LLM_MODEL",
    "CODEBOX_LLM_API_KEY",
    "CODEBOX_LLM_BASE_URL",
    "CODEBOX_TAVILY_API_KEY",
    "CODEBOX_AGENT_RECURSION_LIMIT",
    "CODEBOX_AGENT_EXECUTE_TIMEOUT",
)


@pytest.fixture(autouse=True)
def _clear_llm_env(monkeypatch):
    for name in _LLM_ENV_VARS:
        monkeypatch.delenv(name, raising=False)


class TestFromEnv:
    def test_default_provider_is_openai(self, monkeypatch):
        monkeypatch.setenv("CODEBOX_LLM_MODEL", "gpt-4o")
        monkeypatch.setenv("CODEBOX_LLM_API_KEY", "sk-test")

        cfg = AgentConfig.from_env()
        assert cfg.llm.provider == "openai"
        assert cfg.llm.model == "gpt-4o"
        assert cfg.llm.api_key == "sk-test"

    def test_openrouter_provider(self, monkeypatch):
        monkeypatch.setenv("CODEBOX_LLM_PROVIDER", "openrouter")
        monkeypatch.setenv("CODEBOX_LLM_MODEL", "anthropic/claude-sonnet-4")
        monkeypatch.setenv("CODEBOX_LLM_API_KEY", "sk-or-test")

        cfg = AgentConfig.from_env()
        assert cfg.llm.provider == "openrouter"
        assert cfg.llm.model == "anthropic/claude-sonnet-4"
        assert cfg.llm.api_key == "sk-or-test"

    def test_explicit_openai_provider(self, monkeypatch):
        monkeypatch.setenv("CODEBOX_LLM_PROVIDER", "openai")
        monkeypatch.setenv("CODEBOX_LLM_MODEL", "gpt-4o")
        monkeypatch.setenv("CODEBOX_LLM_API_KEY", "sk-test")

        cfg = AgentConfig.from_env()
        assert cfg.llm.provider == "openai"

    def test_recursion_and_execute_timeout(self, monkeypatch):
        monkeypatch.setenv("CODEBOX_LLM_MODEL", "gpt-4o")
        monkeypatch.setenv("CODEBOX_LLM_API_KEY", "sk-test")
        monkeypatch.setenv("CODEBOX_AGENT_RECURSION_LIMIT", "200")
        monkeypatch.setenv("CODEBOX_AGENT_EXECUTE_TIMEOUT", "300")

        cfg = AgentConfig.from_env()
        assert cfg.recursion_limit == 200
        assert cfg.tools.execute.timeout == 300

    def test_tavily_key(self, monkeypatch):
        monkeypatch.setenv("CODEBOX_LLM_MODEL", "gpt-4o")
        monkeypatch.setenv("CODEBOX_LLM_API_KEY", "sk-test")
        monkeypatch.setenv("CODEBOX_TAVILY_API_KEY", "tvly-test")

        cfg = AgentConfig.from_env()
        assert cfg.tools.web_search.api_key == "tvly-test"

    def test_base_url(self, monkeypatch):
        monkeypatch.setenv("CODEBOX_LLM_MODEL", "gpt-4o")
        monkeypatch.setenv("CODEBOX_LLM_API_KEY", "sk-test")
        monkeypatch.setenv("CODEBOX_LLM_BASE_URL", "https://custom.endpoint")

        cfg = AgentConfig.from_env()
        assert cfg.llm.base_url == "https://custom.endpoint"
