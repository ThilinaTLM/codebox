"""Web search and fetch tools for the coding agent."""

from __future__ import annotations

import logging
import os
import re
from typing import TYPE_CHECKING, Annotated

import httpx
import markdownify
from langchain_core.tools import BaseTool, StructuredTool

if TYPE_CHECKING:
    from codebox_agent.config import ToolsConfig

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Tool factory helpers
# ---------------------------------------------------------------------------


def _make_web_search_fn(
    api_key: str | None = None,
    default_max_results: int = 5,
):
    """Return a ``web_search`` tool function with config baked in."""

    def web_search(
        query: Annotated[str, "The search query"],
        max_results: Annotated[int, "Maximum number of results to return"] = 5,
    ) -> str:
        """Search the web using Tavily AI search.

        Returns relevant results with titles, URLs, and content snippets.
        """
        effective_max = max_results if max_results != 5 else default_max_results

        logger.info("web_search: query=%r, max_results=%d", query, effective_max)
        key = api_key or os.environ.get("TAVILY_API_KEY", "")
        if not key:
            logger.warning("web_search: TAVILY_API_KEY not set")
            return (
                "Error: TAVILY_API_KEY is not set. "
                "Web search is unavailable. You can still use the web_fetch tool "
                "if you have a specific URL."
            )

        from tavily import TavilyClient  # noqa: PLC0415

        try:
            client = TavilyClient(api_key=key)
            response = client.search(query, max_results=effective_max)
        except Exception as exc:
            logger.warning("web_search failed: %s", exc)
            return f"Error performing web search: {exc}"

        results = response.get("results", [])
        logger.info("web_search: got %d results", len(results))
        if not results:
            return "No results found."

        parts: list[str] = []
        for i, r in enumerate(results, 1):
            title = r.get("title", "Untitled")
            url = r.get("url", "")
            content = r.get("content", "")
            parts.append(f"{i}. **{title}**\n   {url}\n   {content}")

        return "\n\n".join(parts)

    return web_search


def _make_web_fetch_fn(
    timeout: int = 30,
    default_max_length: int = 50_000,
):
    """Return a ``web_fetch`` tool function with config baked in."""

    def web_fetch(
        url: Annotated[str, "The URL to fetch"],
        max_length: Annotated[int, "Maximum character length of returned content"] = 50000,
    ) -> str:
        """Fetch a URL and return its content as clean markdown.

        Works with HTML pages, JSON APIs, and plain text.
        """
        effective_max = max_length if max_length != 50000 else default_max_length

        logger.info("web_fetch: url=%s", url)
        try:
            with httpx.Client(timeout=timeout, follow_redirects=True) as client:
                resp = client.get(url, headers={"User-Agent": "CodeboxAgent/1.0"})
                resp.raise_for_status()
        except httpx.TimeoutException:
            logger.warning("web_fetch: timeout fetching %s", url)
            return f"Error: Request timed out fetching {url}"
        except httpx.HTTPStatusError as exc:
            logger.warning("web_fetch: HTTP %d fetching %s", exc.response.status_code, url)
            return f"Error: HTTP {exc.response.status_code} fetching {url}"
        except httpx.RequestError as exc:
            logger.warning("web_fetch: request error fetching %s: %s", url, exc)
            return f"Error: Failed to fetch {url} — {exc}"

        content_type = resp.headers.get("content-type", "")
        logger.info(
            "web_fetch: status=%d, content_type=%s, length=%d",
            resp.status_code,
            content_type,
            len(resp.text),
        )

        if "html" in content_type:
            text = markdownify.markdownify(
                resp.text,
                strip=["script", "style", "nav", "footer", "header"],
            )
            text = re.sub(r"\n{3,}", "\n\n", text)
        else:
            text = resp.text

        text = text.strip()
        if len(text) > effective_max:
            text = text[:effective_max] + "\n\n[Content truncated]"

        return text

    return web_fetch


# ---------------------------------------------------------------------------
# Public builder
# ---------------------------------------------------------------------------


def build_web_tools(config: ToolsConfig | None = None) -> list[BaseTool]:
    """Build web tools, optionally filtered and configured via *config*.

    When *config* is ``None`` the legacy behaviour is preserved (both tools
    enabled, defaults from environment / hardcoded constants).
    """
    tools: list[BaseTool] = []

    # -- web_search ----------------------------------------------------------
    include_search = config.web_search.enabled if config else True
    if include_search:
        ws = config.web_search if config else None
        search_fn = _make_web_search_fn(
            api_key=ws.api_key if ws else None,
            default_max_results=ws.max_results if ws else 5,
        )
        tools.append(
            StructuredTool.from_function(
                name="web_search",
                description=search_fn.__doc__,
                func=search_fn,
            )
        )

    # -- web_fetch -----------------------------------------------------------
    include_fetch = config.web_fetch.enabled if config else True
    if include_fetch:
        wf = config.web_fetch if config else None
        fetch_fn = _make_web_fetch_fn(
            timeout=wf.timeout if wf else 30,
            default_max_length=wf.max_length if wf else 50_000,
        )
        tools.append(
            StructuredTool.from_function(
                name="web_fetch",
                description=fetch_fn.__doc__,
                func=fetch_fn,
            )
        )

    return tools
