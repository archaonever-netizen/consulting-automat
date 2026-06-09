"""Оркестрация проектов через LangChain LCEL цепочки."""
import asyncio

from langchain_core.output_parsers import JsonOutputParser, StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import DeepSeekConfig
from ..models import Client, Function, FunctionAnalysis, OrchestrationRun
from .llm_client import get_llm

_ANALYZE_TASK_PROMPT = """\
Ты главный координатор консалтингового проекта. \
Проанализируй задачу и определи, какие функции компании нужно привлечь.

Доступные функции:
{functions_list}

Задача:
{description}

КРИТИЧЕСКИ ВАЖНО: Ответь ТОЧНО JSON без маркдауна и лишнего текста:
{{
    "functions_needed": ["Функция1", "Функция2"],
    "execution_order": ["Функция1", "Функция2"],
    "reasoning": {{
        "Функция1": "Причина",
        "Функция2": "Причина"
    }}
}}"""

_FUNCTION_SYSTEM_PROMPT = """\
Ты профессиональный ИИ-советник по {function_name}.

О функции: {function_description}

Твоя роль:
- Анализировать задачи в контексте этой функции
- Предлагать конкретные действия и решения
- Выявлять риски и возможности
- Генерировать готовые к использованию рекомендации

Инструкции:
1. Будь конкретным и практичным
2. Предлагай готовые результаты, а не просто советы
3. Указывай риски и зависимости"""

_FUNCTION_ANALYZE_PROMPT = """\
Проанализируй проект с точки зрения этой функции:

Компания: {client_name}
Описание проекта:
{description}

Предоставь анализ:
1. Ключевые задачи из этой функции
2. Критические элементы
3. Риски и проблемы
4. Рекомендации по первым шагам"""

_CONSOLIDATE_PROMPT = """\
Ты главный координатор консалтингового проекта.

Проект: {description}

Анализы от специалистов:
{analyses_text}

Составь консолидированный план действий:
1. Синтез ключевых точек из всех анализов
2. Единый план действий с учётом всех функций
3. Критические зависимости между функциями
4. Риски и вызовы
5. Предлагаемый порядок работы функций

Будь конкретным и практичным."""


async def analyze_task(description: str, available_functions: list[str]) -> dict:
    """Определить нужные функции для задачи через LangChain."""
    llm = get_llm(
        model=DeepSeekConfig.ORCHESTRATOR_MODEL,
        temperature=0.3,
        max_tokens=DeepSeekConfig.TOKENS["analyze_project"],
    )
    prompt = ChatPromptTemplate.from_template(_ANALYZE_TASK_PROMPT)
    chain = prompt | llm | JsonOutputParser()

    functions_list = "\n".join(f"- {f}" for f in available_functions)
    return await chain.ainvoke({"description": description, "functions_list": functions_list})


async def _analyze_single_function(
    client_name: str,
    description: str,
    function_name: str,
    function_desc: str,
) -> str:
    """Анализ проекта с точки зрения одной функции."""
    llm = get_llm(
        model=DeepSeekConfig.FUNCTION_AGENT_MODEL,
        temperature=0.4,
        max_tokens=DeepSeekConfig.TOKENS["create_plan"],
    )
    prompt = ChatPromptTemplate.from_messages([
        ("system", _FUNCTION_SYSTEM_PROMPT),
        ("user", _FUNCTION_ANALYZE_PROMPT),
    ])
    chain = prompt | llm | StrOutputParser()
    return await chain.ainvoke({
        "function_name": function_name,
        "function_description": function_desc or "",
        "client_name": client_name,
        "description": description,
    })


async def _consolidate_analyses(description: str, analyses: dict[str, str]) -> str:
    """Консолидировать результаты всех функций в единый план."""
    llm = get_llm(
        model=DeepSeekConfig.ORCHESTRATOR_MODEL,
        temperature=0.3,
        max_tokens=DeepSeekConfig.TOKENS["consolidate"],
    )
    prompt = ChatPromptTemplate.from_template(_CONSOLIDATE_PROMPT)
    chain = prompt | llm | StrOutputParser()

    analyses_text = "\n".join(
        f"### {fn}:\n{result}" for fn, result in analyses.items() if result
    )
    return await chain.ainvoke({"description": description, "analyses_text": analyses_text})


async def orchestrate_project(
    orchestration_id: int,
    client_id: int,
    description: str,
    db: AsyncSession,
) -> dict:
    """
    Полный цикл оркестрации:
    1. Загрузить клиента и список функций из БД
    2. Определить нужные функции (analyze_task)
    3. Параллельно проанализировать каждую функцию
    4. Сохранить FunctionAnalysis в БД
    5. Консолидировать в итоговый план
    """
    # 1. Загрузить клиента
    client = await db.get(Client, client_id)
    client_name = client.name if client else f"Клиент #{client_id}"

    # 2. Загрузить все функции из БД
    result = await db.execute(select(Function).order_by(Function.sort_order))
    all_functions: list[Function] = result.scalars().all()
    func_by_name = {f.name: f for f in all_functions}
    available_names = list(func_by_name.keys())

    # 3. Определить нужные функции
    try:
        analysis = await analyze_task(description, available_names)
        functions_needed: list[str] = analysis.get("functions_needed", [])
        execution_order: list[str] = analysis.get("execution_order", functions_needed)
        reasoning: dict = analysis.get("reasoning", {})
    except Exception as e:
        functions_needed = available_names[:3]
        execution_order = functions_needed
        reasoning = {}

    # Фильтрация: только те, что есть в БД
    valid_functions = [f for f in execution_order if f in func_by_name]
    if not valid_functions:
        valid_functions = [f.name for f in all_functions[:3]]

    # 4. Создать записи FunctionAnalysis в БД (status=running)
    fa_records: dict[str, FunctionAnalysis] = {}
    for fn_name in valid_functions:
        fa = FunctionAnalysis(
            orchestration_id=orchestration_id,
            function_name=fn_name,
            status="running",
        )
        db.add(fa)
        fa_records[fn_name] = fa
    await db.commit()
    # обновить id записей
    for fa in fa_records.values():
        await db.refresh(fa)

    # 5. Параллельный анализ функций (лимит 3 одновременных LLM-вызова,
    #    чтобы не словить rate-limit / OOM при большом числе функций)
    sem = asyncio.Semaphore(3)

    async def _run_analysis(fn_name: str) -> tuple[str, str | None, str | None]:
        fn_obj = func_by_name.get(fn_name)
        fn_desc = fn_obj.description or "" if fn_obj else ""
        async with sem:
            try:
                res = await _analyze_single_function(client_name, description, fn_name, fn_desc)
                return fn_name, res, None
            except Exception as exc:
                return fn_name, None, str(exc)

    tasks = [_run_analysis(fn) for fn in valid_functions]
    results_raw = await asyncio.gather(*tasks)

    # 6. Сохранить результаты FunctionAnalysis
    function_analyses: dict[str, str] = {}
    for fn_name, result_text, error in results_raw:
        fa = fa_records.get(fn_name)
        if fa:
            fa.status = "completed" if result_text else "failed"
            fa.result = result_text
            fa.error = error
        if result_text:
            function_analyses[fn_name] = result_text
    await db.commit()

    # 7. Консолидация
    consolidated_plan = ""
    if function_analyses:
        try:
            consolidated_plan = await _consolidate_analyses(description, function_analyses)
        except Exception as e:
            consolidated_plan = f"Ошибка консолидации: {e}"

    return {
        "client": client_name,
        "description": description,
        "functions_needed": valid_functions,
        "reasoning": reasoning,
        "function_analyses": {
            fn: {"result": res, "error": err}
            for fn, res, err in results_raw
        },
        "consolidated_plan": consolidated_plan,
    }
