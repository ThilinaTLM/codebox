"""LLM provider configuration and model factory helpers."""

from __future__ import annotations

from dataclasses import dataclass

from langchain_openai import ChatOpenAI
from langchain_openrouter import ChatOpenRouter


@dataclass(frozen=True)
class LLMProviderConfig:
    provider: str
    model: str
    api_key: str
    base_url: str | None = None


def create_chat_model(config: LLMProviderConfig, temperature: float = 0):
    """Create a chat model instance for the selected provider."""
    if config.provider == "openrouter":
        return ChatOpenRouter(
            model=config.model,
            temperature=temperature,
            api_key=config.api_key,
        )

    if config.provider == "openai":
        kwargs = {
            "model": config.model,
            "temperature": temperature,
            "api_key": config.api_key,
        }
        if config.base_url:
            kwargs["base_url"] = config.base_url
        return ChatOpenAI(**kwargs)

    raise ValueError(f"Unsupported LLM provider: {config.provider}")
