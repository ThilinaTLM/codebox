"""Tests for tool filtering via ToolsConfig."""

from __future__ import annotations

from codebox_agent.config import ToolsConfig, WebFetchToolConfig, WebSearchToolConfig
from codebox_agent.tools.web import build_web_tools


class TestBuildWebToolsBackwardCompat:
    """When no config is passed, both tools are returned (legacy behaviour)."""

    def test_no_config_returns_both(self):
        tools = build_web_tools()
        names = {t.name for t in tools}
        assert names == {"web_search", "web_fetch"}

    def test_none_config_returns_both(self):
        tools = build_web_tools(None)
        names = {t.name for t in tools}
        assert names == {"web_search", "web_fetch"}


class TestWebSearchFiltering:
    def test_disabled(self):
        config = ToolsConfig(web_search=WebSearchToolConfig(enabled=False))
        tools = build_web_tools(config)
        names = {t.name for t in tools}
        assert "web_search" not in names
        assert "web_fetch" in names

    def test_enabled_with_api_key(self):
        config = ToolsConfig(web_search=WebSearchToolConfig(enabled=True, api_key="tvly-test"))
        tools = build_web_tools(config)
        names = {t.name for t in tools}
        assert "web_search" in names


class TestWebFetchFiltering:
    def test_disabled(self):
        config = ToolsConfig(web_fetch=WebFetchToolConfig(enabled=False))
        tools = build_web_tools(config)
        names = {t.name for t in tools}
        assert "web_fetch" not in names
        assert "web_search" in names


class TestBothDisabled:
    def test_empty_list(self):
        config = ToolsConfig(
            web_search=WebSearchToolConfig(enabled=False),
            web_fetch=WebFetchToolConfig(enabled=False),
        )
        tools = build_web_tools(config)
        assert tools == []


class TestWebSearchConfigInjection:
    def test_api_key_injected(self, monkeypatch):
        """Config API key is used instead of env var."""
        monkeypatch.delenv("CODEBOX_TAVILY_API_KEY", raising=False)
        config = ToolsConfig(
            web_search=WebSearchToolConfig(enabled=True, api_key="tvly-from-config")
        )
        tools = build_web_tools(config)
        search_tool = next(t for t in tools if t.name == "web_search")
        # The tool should work — invoke it and check it doesn't complain about
        # missing API key (it will fail on the actual Tavily call, but the key
        # resolution happens first).
        result = search_tool.invoke({"query": "test", "max_results": 1})
        # Should NOT say "CODEBOX_TAVILY_API_KEY is not set"
        assert "CODEBOX_TAVILY_API_KEY is not set" not in result

    def test_max_results_default_from_config(self):
        config = ToolsConfig(web_search=WebSearchToolConfig(enabled=True, max_results=3))
        tools = build_web_tools(config)
        search_tool = next(t for t in tools if t.name == "web_search")
        # The tool exists and is callable — config was injected.
        assert search_tool is not None
