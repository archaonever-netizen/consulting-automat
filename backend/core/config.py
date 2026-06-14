from functools import lru_cache

from pydantic_settings import BaseSettings


class DeepSeekConfig:
    """Конфигурация для работы с DeepSeek моделями (копия из корня)."""

    ORCHESTRATOR_MODEL = 'deepseek/deepseek-v4-flash'
    FUNCTION_AGENT_MODEL = 'deepseek/deepseek-v4-flash'
    CHAT_MODEL = 'deepseek/deepseek-v4-flash'

    ORCHESTRATOR_TEMPERATURE = 0.3
    FUNCTION_AGENT_TEMPERATURE = 0.4
    TOP_P = 0.9

    TOKENS = {
        'analyze_project': 10000,
        'create_plan': 10000,
        'generate_checklist': 10000,
        'consolidate': 10000,
    }

    DEEPSEEK_SYSTEM_SUFFIX = """

ВАЖНЫЕ ИНСТРУКЦИИ ДЛЯ DEEPSEEK:
1. Не пытайся быть креативным или добавлять лишний контекст
2. Придерживайся ТОЛЬКО предоставленной информации
3. Если просишь JSON - ответь ТОЛЬКО JSON без дополнительного текста
4. Структурируй ответ четко и логично
5. Не делай предположений, работай с фактами
6. Если информация недостаточна, укажи это явно"""


class Settings(BaseSettings):
    # Database
    database_url: str = "sqlite+aiosqlite:///./instance/app.db"

    # Auth
    secret_key: str = "shef-dev-secret-key-change-in-prod"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days
    founder_email: str = ""
    founder_password: str = ""
    founder_name: str = "Основатель"

    # LLM (Promptra — chat only)
    promptra_api_key: str = ""
    promptra_base_url: str = "https://api.promptra.ru/v1"

    # Embeddings (AITunnel, OpenAI-compatible) — separate client from Promptra chat.
    # Rule: the SAME model + dim are used for indexing and search. Do not change
    # these without re-indexing the whole knowledge base.
    embeddings_base_url: str = "https://api.aitunnel.ru/v1"
    embeddings_api_key: str = ""
    embeddings_model: str = "text-embedding-3-large"
    embeddings_dim: int = 1536

    # Personal Telegram secretary
    telegram_bot_token: str = ""
    telegram_webhook_secret: str = ""
    secretary_owner_telegram_id: str = ""
    secretary_local_user_email: str = ""

    # Декомпозиция целей (движок)
    decomposition_llm_provider: str = "promptra"   # promptra | anthropic
    decomposition_model: str = "anthropic/claude-opus-4.8"  # сильная модель Claude через Promptra
    decomposition_max_retries: int = 2             # ретраев сверх первой попытки
    decomposition_max_tokens: int = 8192
    decomposition_retry_backoff: float = 1.5       # пауза между ретраями, сек
    decomposition_ratelimit_backoff: float = 8.0   # увеличенная пауза при rate limit
    anthropic_api_key: str = ""                    # только при provider=anthropic

    # Yandex Calendar (kept for future)
    yandex_client_id: str = ""
    yandex_client_secret: str = ""
    yandex_redirect_uri: str = "http://localhost:8000/auth/yandex/callback"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # CORS
    frontend_url: str = "http://localhost:5173"

    model_config = {
        "env_file": ".env.local",
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }


@lru_cache()
def get_settings() -> Settings:
    return Settings()
