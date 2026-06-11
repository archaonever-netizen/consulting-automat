"""Фабрика LLM для движка декомпозиции.

По умолчанию ходит через Promptra (OpenAI-совместимый прокси, ключ только на
сервере) и направлен на сильную модель Claude. Температура 0 — для строгого
JSON. Ответ движок берёт как СЫРОЙ ТЕКСТ и парсит JSON сам (try/catch), без
LangChain JsonOutputParser.

Переключение на нативный Anthropic — через DECOMPOSITION_LLM_PROVIDER=anthropic
(требует langchain-anthropic и ANTHROPIC_API_KEY; ключ только на сервере).
"""
from __future__ import annotations

from typing import Any

from ...core.config import Settings, get_settings
from ..llm_client import get_llm


def get_decomposition_llm() -> Any:
    """Вернуть настроенную LLM движка по текущему провайдеру."""
    settings = get_settings()
    provider = (settings.decomposition_llm_provider or "promptra").lower()
    if provider == "anthropic":
        return _anthropic_llm(settings)
    # Promptra → сильная модель Claude, temperature=0.
    return get_llm(
        model=settings.decomposition_model,
        temperature=0,
        max_tokens=settings.decomposition_max_tokens,
    )


def _anthropic_llm(settings: Settings) -> Any:
    """Нативный Anthropic (ленивая зависимость, ключ только на сервере)."""
    try:
        from langchain_anthropic import ChatAnthropic
    except ImportError as exc:  # pragma: no cover - ветка окружения
        raise RuntimeError(
            "DECOMPOSITION_LLM_PROVIDER=anthropic, но langchain-anthropic не установлен"
        ) from exc
    if not settings.anthropic_api_key:
        raise RuntimeError("ANTHROPIC_API_KEY не задан для провайдера anthropic")
    return ChatAnthropic(
        model=settings.decomposition_model,
        temperature=0,
        api_key=settings.anthropic_api_key,
        max_tokens=settings.decomposition_max_tokens,
    )
