"""Узлы графа сети агентов: router, department_agent, consolidator.

Поток управления:
    START → router → (department_agent ⟲)* → consolidator → END

`router` определяет стартовые функции и их executor-отделы. `department_agent`
обрабатывает очередь запросов по одному: при нехватке входов от поставщиков
докидывает под-запросы и откладывает себя, иначе выполняет функцию (микро-слой).
`consolidator` собирает все результаты в итоговый план.
"""
from datetime import datetime

from langchain_core.output_parsers import JsonOutputParser, StrOutputParser
from langchain_core.prompts import ChatPromptTemplate

from ...core.config import DeepSeekConfig
from ..llm_client import get_llm
from .department_tools import (
    available_tools_brief,
    collect_supplier_outputs,
    format_frameworks,
    format_supplier_context,
    run_tools,
    supplier_pairs_for,
)
from .state import AgentNetworkState

_ROUTER = "router"
_AGENT = "department_agent"
_CONSOLIDATOR = "consolidator"
_COORDINATOR = "Координатор"


# ───────────────────────── промпты ─────────────────────────

_ROUTE_PROMPT = """\
Ты главный координатор консалтингового проекта. По описанию проекта определи,
какие функции компании нужно привлечь и в каком порядке.

Доступные функции:
{functions_list}

Описание проекта:
{description}

КРИТИЧЕСКИ ВАЖНО: ответь ТОЧНО JSON без маркдауна и лишнего текста:
{{
    "functions_needed": ["Функция1", "Функция2"]
}}"""

_DEPT_SYSTEM = """\
Ты ИИ-агент отдела «{dept}» консалтинговой компании.
Об отделе: {dept_desc}

Сейчас ты отвечаешь за функцию «{function}».
О функции: {function_desc}

Твоя роль:
- Выполнять эту функцию в контексте проекта
- Давать конкретные, готовые к использованию результаты
- Учитывать входные данные от смежных отделов (если они есть)
- Указывать риски и зависимости"""

_DEPT_USER = """\
Компания: {client_name}
Описание проекта:
{project}

Запрос от отдела «{from_dept}»:
{question}

Входные данные от смежных отделов (поставщиков):
{supplier_context}

Применяемые фреймворки (заполни их каркасы конкретикой проекта):
{frameworks}

Выполни функцию «{function}» и дай конкретный результат:
1. Ключевые задачи и решения по этой функции
2. Что передать дальше потребителям
3. Риски и зависимости"""

_SELECT_PROMPT = """\
Ты ИИ-агент отдела «{dept}», отвечаешь за функцию «{function}».
О функции: {function_desc}
Проект: {project}

Доступные инструменты (фреймворки):
{tools_brief}

Выбери от одного до трёх НАИБОЛЕЕ уместных инструментов для этой функции.
КРИТИЧЕСКИ ВАЖНО: ответь ТОЧНО JSON без маркдауна и лишнего текста:
{{"tools": ["имя1", "имя2"]}}"""

_CONSOLIDATE_PROMPT = """\
Ты главный координатор консалтингового проекта.

Проект: {description}

Результаты работы отделов:
{analyses_text}

Составь консолидированный план действий:
1. Синтез ключевых точек из всех отделов
2. Единый план действий
3. Критические зависимости между функциями/отделами
4. Риски и вызовы
5. Предлагаемый порядок работы

Будь конкретным и практичным."""


def _trace(node: str, status: str) -> dict:
    return {"node": node, "status": status, "ts": datetime.utcnow().isoformat()}


def _question_for(function: str, from_dept: str) -> str:
    return f"Отдел «{from_dept}» просит результат по функции «{function}»."


# ───────────────────────── router ─────────────────────────

async def router_node(state: AgentNetworkState) -> dict:
    """Определить стартовые функции и поставить первые запросы в очередь."""
    topology = state["topology"]
    available = list(topology["functions"].keys())

    needed: list[str] = []
    try:
        llm = get_llm(
            model=DeepSeekConfig.ORCHESTRATOR_MODEL,
            temperature=0.3,
            max_tokens=DeepSeekConfig.TOKENS["analyze_project"],
        )
        chain = ChatPromptTemplate.from_template(_ROUTE_PROMPT) | llm | JsonOutputParser()
        data = await chain.ainvoke({
            "description": state["project_description"],
            "functions_list": "\n".join(f"- {f}" for f in available),
        })
        if isinstance(data, dict):
            needed = [f for f in data.get("functions_needed", []) if f in topology["functions"]]
    except Exception:
        needed = []

    # фолбэк: если LLM не дал валидных функций — берём первые три
    if not needed:
        needed = available[:3]

    requests: list[dict] = []
    visited: set = set()
    trace: list[dict] = [_trace(_ROUTER, f"проект разобран, функции: {', '.join(needed) or '—'}")]

    for function in needed:
        executor = topology["functions"][function].get("executor")
        if not executor:
            # У функции нет executor-ребра → пометить как unresolved (риск из архитектуры)
            trace.append(_trace(_ROUTER, f"⚠ функция «{function}» без executor — пропущена"))
            continue
        key = (executor, function)
        if key in visited:
            continue
        visited.add(key)
        requests.append({
            "from_dept": _COORDINATOR,
            "to_dept": executor,
            "function": function,
            "question": _question_for(function, _COORDINATOR),
            "_defer": 0,
        })
        trace.append(_trace(_ROUTER, f"старт: «{function}» → отдел «{executor}»"))

    return {"pending_requests": requests, "visited": visited, "trace": trace}


# ────────────────────── department_agent ──────────────────────

async def _select_tools(state: AgentNetworkState, dept: str, function: str) -> list[str]:
    """Микро-слой, шаг 1: динамически выбрать уместные фреймворки (JSON-парсинг).

    Выбор через JSON, а не function-calling — Promptra может его не поддерживать
    (риск из архитектуры). При сбое — пустой список (синтез без фреймворка).
    """
    fn_info = state["topology"]["functions"].get(function, {})
    try:
        llm = get_llm(model=DeepSeekConfig.ORCHESTRATOR_MODEL, temperature=0.0, max_tokens=300)
        chain = ChatPromptTemplate.from_template(_SELECT_PROMPT) | llm | JsonOutputParser()
        data = await chain.ainvoke({
            "dept": dept,
            "function": function,
            "function_desc": fn_info.get("description", ""),
            "project": state["project_description"],
            "tools_brief": available_tools_brief(),
        })
        if isinstance(data, dict):
            tools = data.get("tools", [])
            if isinstance(tools, list):
                return [t for t in tools if isinstance(t, str)][:3]
    except Exception:
        pass
    return []


async def _run_department_micro(
    state: AgentNetworkState,
    dept: str,
    function: str,
    request: dict,
    supplier_outputs: dict[str, str],
) -> tuple[str, list[str]]:
    """Микро-слой: выбрать фреймворки → выполнить их (чистые тулзы) → синтез.

    Возвращает (текст результата, список выбранных тулз) — имена тулз идут в trace.
    """
    topology = state["topology"]
    fn_info = topology["functions"].get(function, {})
    dept_info = topology["departments"].get(dept, {})

    # шаг 1: динамический выбор фреймворков
    selected = await _select_tools(state, dept, function)
    # шаг 2: выполнить выбранные тулзы (детерминированные чистые функции)
    ctx = {
        "function": function,
        "dept": dept,
        "project": state["project_description"],
        "client": state["client_name"],
    }
    frameworks = run_tools(selected, ctx)

    # шаг 3: синтез результата с учётом каркасов и входов поставщиков
    llm = get_llm(
        model=DeepSeekConfig.FUNCTION_AGENT_MODEL,
        temperature=0.4,
        max_tokens=DeepSeekConfig.TOKENS["create_plan"],
    )
    prompt = ChatPromptTemplate.from_messages([
        ("system", _DEPT_SYSTEM),
        ("user", _DEPT_USER),
    ])
    chain = prompt | llm | StrOutputParser()
    output = await chain.ainvoke({
        "dept": dept,
        "dept_desc": dept_info.get("description", ""),
        "function": function,
        "function_desc": fn_info.get("description", ""),
        "client_name": state["client_name"],
        "project": state["project_description"],
        "from_dept": request.get("from_dept", _COORDINATOR),
        "question": request.get("question", ""),
        "supplier_context": format_supplier_context(supplier_outputs),
        "frameworks": format_frameworks(frameworks),
    })
    return output, list(frameworks.keys())


async def department_agent_node(state: AgentNetworkState) -> dict:
    """Обработать ОДИН запрос из очереди.

    - если результат уже есть → переиспользовать (анти-цикл);
    - если не хватает входов от поставщиков → докинуть их запросы и отложить себя;
    - иначе → выполнить функцию (микро-слой) и записать результат.
    """
    pending = list(state["pending_requests"])
    if not pending:
        return {}

    request = pending.pop(0)
    to_dept = request["to_dept"]
    function = request["function"]
    topology = state["topology"]
    results = state["results"]
    visited = state["visited"]

    trace: list[dict] = []
    new_visited: set = set()

    # Уже выполнено в рамках этого прогона → переиспользуем результат (анти-цикл A→B→A)
    if results.get(to_dept, {}).get(function):
        trace.append(_trace(to_dept, f"переиспользование результата: «{function}»"))
        return {"pending_requests": pending, "trace": trace}

    # Какие входы от поставщиков нужны и каких ещё нет
    supplier_pairs = supplier_pairs_for(topology, function)
    new_requests: list[dict] = []
    missing = False
    for dep, func in supplier_pairs:
        if results.get(dep, {}).get(func):
            continue
        missing = True
        skey = (dep, func)
        if skey in visited or skey in new_visited:
            continue  # уже в работе / в очереди
        new_visited.add(skey)
        new_requests.append({
            "from_dept": to_dept,
            "to_dept": dep,
            "function": func,
            "question": _question_for(func, to_dept),
            "_defer": 0,
        })
        trace.append(_trace(dep, f"запрос от «{to_dept}»: нужна функция «{func}»"))

    # Лимит откладывания — страховка от зависших цепочек/циклов поставщиков.
    defer = request.get("_defer", 0)
    defer_cap = max(3, len(topology["functions"]))

    if missing and defer < defer_cap:
        # Поставщики ещё не готовы: их запросы вперёд, текущий — в конец очереди.
        request["_defer"] = defer + 1
        pending = new_requests + pending + [request]
        return {"pending_requests": pending, "visited": new_visited, "trace": trace}

    # Хватает данных (или достигнут лимит откладывания) → выполняем функцию.
    supplier_outputs = collect_supplier_outputs(results, supplier_pairs)
    try:
        output, used_tools = await _run_department_micro(
            state, to_dept, function, request, supplier_outputs
        )
        if used_tools:
            trace.append(_trace(to_dept, f"фреймворки: {', '.join(used_tools)}"))
        trace.append(_trace(to_dept, f"выполнено: «{function}»"))
    except Exception as exc:
        output = f"[ошибка выполнения функции «{function}»: {exc}]"
        trace.append(_trace(to_dept, f"ошибка: «{function}» ({exc})"))

    new_visited.add((to_dept, function))
    # Любые обнаруженные запросы поставщиков всё равно добавляем в очередь
    pending = new_requests + pending
    return {
        "pending_requests": pending,
        "results": {to_dept: {function: output}},
        "visited": new_visited,
        "trace": trace,
    }


# ──────────────────────── consolidator ────────────────────────

async def consolidator_node(state: AgentNetworkState) -> dict:
    """Очередь пуста → собрать все результаты в единый план."""
    results = state["results"]
    analyses: dict[str, str] = {}
    for dept, funcs in results.items():
        for func, output in funcs.items():
            if output:
                analyses[f"{dept} ({func})"] = output

    if not analyses:
        return {
            "consolidated": "",
            "trace": [_trace(_CONSOLIDATOR, "нет результатов для консолидации")],
        }

    analyses_text = "\n\n".join(f"### {label}:\n{text}" for label, text in analyses.items())
    try:
        llm = get_llm(
            model=DeepSeekConfig.ORCHESTRATOR_MODEL,
            temperature=0.3,
            max_tokens=DeepSeekConfig.TOKENS["consolidate"],
        )
        chain = ChatPromptTemplate.from_template(_CONSOLIDATE_PROMPT) | llm | StrOutputParser()
        consolidated = await chain.ainvoke({
            "description": state["project_description"],
            "analyses_text": analyses_text,
        })
    except Exception as exc:
        consolidated = f"Ошибка консолидации: {exc}"

    return {
        "consolidated": consolidated,
        "trace": [_trace(_CONSOLIDATOR, "итоговый план собран")],
    }


# ──────────────────────── маршрутизация ────────────────────────

def route_after_agent(state: AgentNetworkState) -> str:
    """Очередь непуста → снова department_agent; иначе → consolidator."""
    return _AGENT if state["pending_requests"] else _CONSOLIDATOR
