"""Web search and fetch tools for the coding agent."""

from __future__ import annotations

import logging
import os
import re
from typing import Annotated

import httpx
import markdownify
from langchain_core.tools import BaseTool, StructuredTool

logger = logging.getLogger(__name__)


def _web_search(
    query: Annotated[str, "The search query"],
    max_results: Annotated[int, "Maximum number of results to return"] = 5,
) -> str:
    """Search the web using Tavily AI search. Returns relevant results with titles, URLs, and content snippets."""
    logger.info("web_search: query=%r, max_results=%d", query, max_results)
    api_key = os.environ.get("TAVILY_API_KEY", "")
    if not api_key:
        logger.warning("web_search: TAVILY_API_KEY not set")
        return (
            "Error: TAVILY_API_KEY is not set. "
            "Web search is unavailable. You can still use the web_fetch tool "
            "if you have a specific URL."
        )

    from tavily import TavilyClient

    try:
        client = TavilyClient(api_key=api_key)
        response = client.search(query, max_results=max_results)
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


def _web_fetch(
    url: Annotated[str, "The URL to fetch"],
    max_length: Annotated[int, "Maximum character length of returned content"] = 50000,
) -> str:
    """Fetch a URL and return its content as clean markdown. Works with HTML pages, JSON APIs, and plain text."""
    logger.info("web_fetch: url=%s", url)
    try:
        with httpx.Client(timeout=30, follow_redirects=True) as client:
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
        # Collapse excessive whitespace
        text = re.sub(r"\n{3,}", "\n\n", text)
    else:
        text = resp.text

    text = text.strip()
    if len(text) > max_length:
        text = text[:max_length] + "\n\n[Content truncated]"

    return text


def build_web_tools() -> list[BaseTool]:
    """Build and return the web search and fetch tools."""
    return [
        StructuredTool.from_function(
            name="web_search",
            description=_web_search.__doc__,
            func=_web_search,
        ),
        StructuredTool.from_function(
            name="web_fetch",
            description=_web_fetch.__doc__,
            func=_web_fetch,
        ),
    ]
