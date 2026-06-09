from langchain_openai import ChatOpenAI
from ..core.config import get_settings, DeepSeekConfig


def get_llm(
    model: str | None = None,
    temperature: float = 0.7,
    streaming: bool = False,
    max_tokens: int = 4096,
) -> ChatOpenAI:
    """Возвращает ChatOpenAI, настроенный на Promptra API (OpenAI-совместимый)."""
    settings = get_settings()
    return ChatOpenAI(
        api_key=settings.promptra_api_key,
        base_url="https://api.promptra.ru/v1",
        model=model or DeepSeekConfig.CHAT_MODEL,
        temperature=temperature,
        streaming=streaming,
        timeout=300,
        max_tokens=max_tokens,
    )
