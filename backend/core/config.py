from pydantic_settings import BaseSettings
from functools import lru_cache


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

    # LLM
    promptra_api_key: str = ""

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
