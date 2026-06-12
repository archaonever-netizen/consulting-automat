111# Архитектура: Сеть ИИ-агентов (executor / supplier)

> Статус: **реализовано** (этапы 1–4 плана внедрения). Сеть живёт в
> `backend/services/agent_network/` (`state.py`, `topology.py`, `nodes.py`,
> `graph.py`, `department_tools.py`, `runner.py`). Запуск: Celery
> `run_orchestration(..., mode="network")` (фон) или SSE
> `GET /api/agent/orchestration/{id}/stream` (live, через `POST /api/agent/network/{client_id}`).
> Фронт live-прогресса: `frontend/src/pages/OrchestrationPage.tsx` (раздел «Сеть агентов»).
> Микро-слой (этап 4): `department_agent` динамически выбирает фреймворки из
> `DEPARTMENT_TOOLS` (SWOT / реестр рисков / чек-лист / RACI) через JSON-селектор
> и подкладывает их каркасы в синтез. Smoke-тест без БД/LLM:
> `python -m backend.services.agent_network._smoke_test`.
> Текущий LCEL-конвейер (`backend/services/orchestrator_service.py`) остаётся как
> v1/фолбэк и НЕ удаляется. Остаётся **этап 5** — переключение network режимом по
> умолчанию после стабилизации на реальных данных.

---

## Часть 1. Простыми словами (для владельца продукта)

В системе есть **функции** (Техническая, Коммерческая и т.д.) и **отделы**.
Отделы связаны друг с другом по ролям:
- **executor** — отдел, который *выполняет* функцию;
- **consumer** — отдел, который *потребляет* результат функции;
- **supplier** — отдел, который *поставляет* что-то для функции.

Идея: каждый отдел получает собственного **ИИ-агента**. Агенты общаются между
собой как живые коллеги — consumer просит executor, executor при нехватке данных
идёт к своим supplier'ам. Получается **сеть помощников**, которые перекидывают
друг другу подзадачи и в итоге собирают общий результат. Пользователь при этом
видит **живой прогресс**: кто над чем работает прямо сейчас.

Почему не «один большой ИИ со списком всех отделов»: когда отделов много и они
зависят друг от друга по цепочке, один агент путается и невозможно отследить,
кто кому что передал. Сеть отдельных агентов повторяет реальную оргструктуру и
прозрачна.

Инструмент для такой сети — **LangGraph** (надстройка над LangChain для
графов агентов с состоянием, циклами и стримингом прогресса).

---

## Часть 2. Что уже есть и переиспользуется

### Модели БД (`backend/models.py`) — менять не нужно
- `Function` — функция компании.
- `Department` — отдел.
- `FunctionDepartmentLink(function_id, department_id, relation_type)` —
  `relation_type ∈ {executor, consumer, supplier}`. **Это и есть рёбра графа.**
  Хелперы уже есть: `Function.executor_link`, `.consumer_links`, `.supplier_links`;
  `Department.executor_links`, `.consumer_links`, `.supplier_links`.
- `OrchestrationRun` / `FunctionAnalysis` — записи прогона и поузловых результатов
  (созданы на этапе 2, переиспользуются для хранения хода работы сети).

### Инфраструктура
- LLM: `backend/services/llm_client.py` → `get_llm()` (ChatOpenAI на Promptra).
- Фон: Celery `run_orchestration` (`backend/workers/tasks.py`) — точка запуска.
- SSE/прогресс: паттерн из `backend/services/chat_service.py` (`StreamingResponse`).

---

## Часть 3. Целевая архитектура (для разработчика)

### 3.1. Два слоя

**Макро-слой — граф отделов (LangGraph).**
Узел = агент отдела. Рёбра строятся из `FunctionDepartmentLink`. По графу ходят
запросы consumer→executor→supplier. Граф держит общее состояние и стримит его.

**Микро-слой — внутренности узла.**
Внутри узла либо детерминированный код («фичи/фреймворки функции» — обычные
Python-функции-тулзы), либо маленький `create_tool_calling_agent` с тулзами
ТОЛЬКО этого отдела, когда нужен динамический выбор действия. Тулзы — чистые
функции (не методы класса).

### 3.2. Состояние графа (LangGraph State)

```python
from typing import TypedDict, Annotated
import operator

class AgentNetworkState(TypedDict):
    orchestration_id: int          # связь с OrchestrationRun
    client_id: int
    project_description: str

    # очередь запросов между агентами (consumer -> executor -> supplier)
    pending_requests: list[dict]   # {from_dept, to_dept, function, question}

    # накопленные результаты по отделам/функциям
    results: Annotated[dict, operator.or_]   # {dept_name: {function: output}}

    # защита от циклов: какие (dept, function) уже обрабатывались
    visited: Annotated[set, operator.or_]

    # лог шагов для стриминга прогресса в SSE
    trace: Annotated[list, operator.add]     # [{node, status, ts}]
```

### 3.3. Узлы

1. **router (вход).** Аналог нынешнего `analyze_task`: по описанию проекта и
   списку функций определяет стартовые функции и их executor-отделы, кладёт
   первые запросы в `pending_requests`.
2. **department_agent (универсальный узел).** Берёт запрос из очереди:
   - если данных хватает → выполняет (микро-слой) и пишет в `results`;
   - если нужен вход от supplier'а → добавляет запрос `to_dept=supplier` в
     `pending_requests` (рекурсия по графу);
   - помечает `(dept, function)` в `visited`.
3. **consolidator (выход).** Когда очередь пуста — собирает `results` в итоговый
   план (аналог `_consolidate_analyses`) и пишет в `OrchestrationRun.results`.

### 3.4. Рёбра и поток управления

- Условное ребро после `department_agent`: если `pending_requests` непусто →
  снова `department_agent` (цикл обработки очереди); иначе → `consolidator`.
- **Циклы безопасны:** перед обработкой запроса проверяем `visited`. Если
  `(to_dept, function)` уже обработан — не уходим вглубь, а переиспользуем
  готовый результат из `results`. Это предотвращает бесконечные A→B→A.
- Лимит глубины/числа шагов (`recursion_limit` у LangGraph) — страховка.

### 3.5. Протокол запроса между агентами

```
request = {
  "from_dept": "Отдел продаж",     # кто просит (consumer)
  "to_dept":   "Технический отдел", # кто исполняет (executor)
  "function":  "Техническая",       # какая функция
  "question":  "Что нужно от соседа, текстом"
}
```
Узел executor может породить под-запросы к своим supplier'ам с тем же форматом
(`from_dept` = он сам). Так строится цепочка по реальным рёбрам графа.

### 3.6. Стриминг прогресса (live progress)

LangGraph умеет `graph.astream(state, stream_mode="updates")` — на каждом шаге
отдаёт обновление состояния. Оборачиваем это в SSE так же, как в
`chat_service.stream_response`: каждый элемент `trace` → событие
`data: {"node": "...", "status": "..."}\n\n`. Фронт показывает, какой отдел
сейчас работает (заменяет polling каждые 3 сек из старого Flask).

### 3.7. Где это живёт (файлы)

```
backend/services/agent_network/
├── state.py          # AgentNetworkState (TypedDict выше)
├── graph.py          # сборка StateGraph: узлы, рёбра, компиляция
├── nodes.py          # router, department_agent, consolidator
├── department_tools.py  # тулзы отделов (микро-слой), чистые функции
└── __init__.py       # def build_graph() -> CompiledGraph
```
- Точка запуска: `backend/workers/tasks.py` — рядом с `run_orchestration` либо
  внутри неё по флагу (`mode="network"` vs текущий `mode="pipeline"`).
- Стриминг-эндпоинт: добавить в `backend/routes/agent.py`
  `GET /api/agent/orchestration/{id}/stream` (SSE), отдающий `trace`.

### 3.8. Зависимости

```
# backend/requirements.txt
langgraph>=0.2.0
```
LangChain/`langchain-core` уже есть. `get_llm()` переиспользуется как есть.

---

## Часть 4. План внедрения (поэтапно, низкий риск)

1. **Прототип на 2–3 отделах.** `build_graph()` + три узла + state. Запуск
   синхронно из скрипта, без Celery/SSE. Цель — увидеть, что запросы ходят по
   рёбрам и циклы не зацикливаются.
2. **Интеграция с прогоном.** Писать ход в `OrchestrationRun`/`FunctionAnalysis`,
   запуск через Celery `run_orchestration(mode="network")`.
3. **Стриминг.** SSE-эндпоинт + индикация на фронте «какой отдел работает».
4. **Микро-слой.** Наполнить `department_tools.py` реальными фичами функций.
5. **Переключение по умолчанию** после стабилизации; LCEL-конвейер остаётся
   фолбэком.

---

## Часть 5. Ключевые риски и решения

| Риск | Решение |
|------|---------|
| Бесконечные циклы A→B→A | `visited` + `recursion_limit`, переиспользование результата |
| Promptra не поддерживает function-calling | Микро-слой через JSON-парсинг (как `analyze_task`), не `with_structured_output` |
| Параллельные LLM-вызовы → rate-limit | `asyncio.Semaphore` (как уже сделано в orchestrator_service) |
| Async в Celery worker | `asyncio.run()` + `engine.dispose()` в конце (паттерн уже в tasks.py) |
| Граф «застрял» (нет executor у функции) | router валидирует наличие executor-ребра; иначе помечает функцию как unresolved |

---

## TL;DR для следующей сессии

Реализовать сеть агентов на **LangGraph**: узлы = отделы (`Department`), рёбра =
`FunctionDepartmentLink` (executor/consumer/supplier). Состояние — `AgentNetworkState`
с очередью запросов, результатами, `visited` (анти-цикл) и `trace` (для SSE).
Три узла: `router` (определяет старт), `department_agent` (обрабатывает очередь,
рекурсивно ходит к supplier'ам), `consolidator` (собирает итог). Переиспользовать
`get_llm()`, `OrchestrationRun`, Celery-паттерн и SSE из `chat_service`. Начать с
прототипа на 2–3 отделах. Текущий LCEL-конвейер не трогать — он v1/фолбэк.
