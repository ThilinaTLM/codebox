"""Logging configuration helpers for codebox-agent consumers."""

import logging

_INTERNAL_LOGGER_PREFIXES = [
    "codebox_agent",
    "httpx",
    "httpcore",
    "langchain",
    "langgraph",
    "openai",
]


def suppress_internal_loggers(level: int = logging.WARNING) -> None:
    """Suppress INFO/DEBUG from codebox-agent internals and dependencies.

    Opt-in helper for consumers (e.g. GitHub Action in human-readable mode)
    that want clean output without framework chatter.
    """
    for prefix in _INTERNAL_LOGGER_PREFIXES:
        logging.getLogger(prefix).setLevel(level)
