# deepseek_config.py
"""Оптимальные настройки DeepSeek для различных типов задач в ШЕФ."""

class DeepSeekConfig:
    """Конфигурация для работы с DeepSeek моделями."""

    # Модели
    ORCHESTRATOR_MODEL = 'deepseek/deepseek-v4-pro'
    FUNCTION_AGENT_MODEL = 'deepseek/deepseek-v4-pro'

    # Температура (0-1): низкая = детерминированный ответ, высокая = творческий
    # DeepSeek требует НИЗКУЮ температуру чтобы не галлюцинировать
    ORCHESTRATOR_TEMPERATURE = 0.3  # строгий анализ
    FUNCTION_AGENT_TEMPERATURE = 0.4  # немного гибче для анализа

    # Параметры семплирования (для лучшей стабильности)
    TOP_P = 0.9  # nucleus sampling (какой % вероятности учитывать)

    # Max tokens для разных типов операций
    TOKENS = {
        'analyze_project': 2500,      # анализ проекта (нужно больше для JSON)
        'create_plan': 2000,          # план действий
        'generate_checklist': 2000,   # чек-лист
        'consolidate': 3000,          # консолидация результатов всех агентов
    }

    # Промпт-инструкции специфичные для DeepSeek
    DEEPSEEK_SYSTEM_SUFFIX = """

ВАЖНЫЕ ИНСТРУКЦИИ ДЛЯ DEEPSEEK:
1. Не пытайся быть креативным или добавлять лишний контекст
2. Придерживайся ТОЛЬКО предоставленной информации
3. Если просишь JSON - ответь ТОЛЬКО JSON без дополнительного текста
4. Структурируй ответ четко и логично
5. Не делай предположений, работай с фактами
6. Если информация недостаточна, укажи это явно"""

    @classmethod
    def get_tokens_for_task(cls, task_type: str) -> int:
        """Получить оптимальное количество токенов для задачи."""
        return cls.TOKENS.get(task_type, 1500)

    @classmethod
    def get_config_dict(cls, agent_type: str = 'function') -> dict:
        """Получить полный конфиг для создания запроса."""
        if agent_type == 'orchestrator':
            return {
                'model': cls.ORCHESTRATOR_MODEL,
                'temperature': cls.ORCHESTRATOR_TEMPERATURE,
                'top_p': cls.TOP_P,
            }
        else:  # function agent
            return {
                'model': cls.FUNCTION_AGENT_MODEL,
                'temperature': cls.FUNCTION_AGENT_TEMPERATURE,
                'top_p': cls.TOP_P,
            }
