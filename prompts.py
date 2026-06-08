# prompts.py
"""Библиотека системных промптов для агентов."""


class OrchestratorPrompts:
    """Промпты для главного координатора агентов."""

    @staticmethod
    def analyze_task(task_description: str, available_functions: list) -> str:
        """Промпт для анализа задачи и определения нужных функций."""
        functions_list = '\n'.join([f"- {f}" for f in available_functions])

        return f"""Ты главный координатор консалтингового проекта. Твоя задача анализировать поступившие проекты и определять, какие функции компании нужно привлечь к выполнению.

Доступные функции:
{functions_list}

Задача:
{task_description}

Проанализируй задачу и определи:
1. Какие функции необходимо привлечь (перечисли по названиям из списка выше)
2. В каком порядке они должны работать (зависимости)
3. Краткое объяснение для каждой функции, почему она нужна

Ответь ТОЛЬКО JSON без дополнительного текста:
{{
    "functions_needed": ["Функция1", "Функция2"],
    "execution_order": ["Функция1", "Функция2"],
    "reasoning": {{
        "Функция1": "Причина привлечения",
        "Функция2": "Причина привлечения"
    }}
}}"""

    @staticmethod
    def create_action_plan(task: str, analysis: str, function_name: str) -> str:
        """Промпт для создания общего плана действий."""
        return f"""На основе проведенного анализа составь детальный план действий для проекта.

Исходная задача:
{task}

Анализ задачи:
{analysis}

Функция, которая будет основным координатором: {function_name}

Составь план в формате:
1. Фаза подготовки (кратко)
2. Фаза основной работы (по этапам)
3. Фаза завершения и контроля

Будь конкретным и практичным."""


class FunctionAgentPrompts:
    """Промпты для функциональных советников."""

    @staticmethod
    def system_prompt(function_name: str, function_description: str) -> str:
        """Системный промпт для агента функции."""
        return f"""Ты профессиональный ИИ-советник по {function_name.lower()}.

О функции:
{function_description}

Твоя роль:
- Анализировать задачи в контексте {function_name.lower()}
- Предлагать конкретные действия и решения
- Выявлять риски и возможности
- Генерировать документы, чек-листы и рекомендации
- Частично выполнять рутинные задачи (анализ, документация, планирование)

Инструкции:
1. Будь профессиональным и конкретным
2. Опирайся на лучшие практики в области {function_name.lower()}
3. Предлагай готовые к использованию результаты (не просто советы)
4. Указывай на возможные риски и зависимости
5. Ссылайся на связанные функции, если это важно"""

    @staticmethod
    def analyze_project(client_name: str, project_description: str) -> str:
        """Промпт для анализа проекта с точки зрения функции."""
        return f"""Проанализируй проект с точки зрения этой функции:

Компания: {client_name}
Описание проекта:
{project_description}

Предоставь анализ в формате:
1. Ключевые задачи (из этой функции)
2. Критические элементы, на которые нужно обратить внимание
3. Риски и проблемы
4. Рекомендации по первым шагам"""

    @staticmethod
    def create_actionable_plan(project_context: str, agent_role: str) -> str:
        """Промпт для создания конкретного плана действий."""
        return f"""На основе следующего контекста создай конкретный, actionable план действий.

Контекст проекта:
{project_context}

Роль этой функции: {agent_role}

План должен включать:
1. Конкретные шаги (а не общие рекомендации)
2. Примерные сроки для каждого шага
3. Ответственный (человек или система)
4. Зависимости и связи с другими функциями

Формат: нумерованный список с деталями"""

    @staticmethod
    def generate_checklist(topic: str) -> str:
        """Промпт для генерации чек-листа по теме."""
        return f"""Создай подробный, практичный чек-лист для: {topic}

Чек-лист должен быть:
- Конкретным и actionable
- Включать примеры и объяснения для каждого пункта
- Организован по логическим группам
- Готов к использованию в реальном проекте

Формат: [ ] Пункт - описание"""


class ContextBuilder:
    """Утилиты для построения контекста агентов."""

    @staticmethod
    def format_function_context(function_obj) -> str:
        """Форматировать контекст функции для промпта."""
        lines = [f"Функция: {function_obj.name}"]

        if function_obj.description:
            lines.append(f"Описание: {function_obj.description}")

        executor = function_obj.executor_link
        if executor:
            lines.append(f"Основной исполнитель: {executor.department.name}")

        consumers = function_obj.consumer_links
        if consumers:
            consumer_names = ", ".join([l.department.name for l in consumers])
            lines.append(f"Потребители: {consumer_names}")

        suppliers = function_obj.supplier_links
        if suppliers:
            supplier_names = ", ".join([l.department.name for l in suppliers])
            lines.append(f"Поставщики: {supplier_names}")

        return "\n".join(lines)

    @staticmethod
    def format_client_context(client_obj) -> str:
        """Форматировать контекст клиента для промпта."""
        lines = [f"Клиент: {client_obj.name}"]

        if client_obj.profile and client_obj.profile.executive_summary:
            lines.append(f"Резюме: {client_obj.profile.executive_summary}")

        return "\n".join(lines)
