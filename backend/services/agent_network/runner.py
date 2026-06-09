"""Точки запуска сети агентов: фоновый прогон (Celery) и live-стриминг (SSE).

Оба пути переиспользуют один и тот же скомпилированный граф. Различие только в
способе доставки прогресса: `run_network` гоняет граф до конца (`ainvoke`),
`stream_network` стримит trace по ходу (`astream`, stream_mode="values").
"""
import json
from datetime import datetime
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession

from ...models import Client, FunctionAnalysis, OrchestrationRun
from .graph import build_graph
from .state import AgentNetworkState
from .topology import load_topology

# Узлов на запрос немного, но при больших графах очередь длинная — поднимаем лимит.
_RECURSION_LIMIT = 200


def _initial_state(
    orchestration_id: int,
    client_id: int,
    client_name: str,
    description: str,
    topology: dict,
) -> AgentNetworkState:
    return {
        "orchestration_id": orchestration_id,
        "client_id": client_id,
        "client_name": client_name,
        "project_description": description,
        "topology": topology,
        "pending_requests": [],
        "results": {},
        "visited": set(),
        "trace": [],
        "consolidated": "",
    }


def _results_payload(client_name: str, description: str, final: dict) -> dict:
    """Сформировать payload для `OrchestrationRun.results` из финального состояния."""
    function_analyses: dict[str, dict] = {}
    for dept, funcs in final.get("results", {}).items():
        for func, output in funcs.items():
            function_analyses[f"{dept} / {func}"] = {"result": output, "error": None}
    return {
        "mode": "network",
        "client": client_name,
        "description": description,
        "function_analyses": function_analyses,
        "consolidated_plan": final.get("consolidated", ""),
        "trace": final.get("trace", []),
    }


async def _persist_analyses(db: AsyncSession, orchestration_id: int, final: dict) -> None:
    """Записать поузловые результаты как FunctionAnalysis (переиспользуем модель этапа 2)."""
    for dept, funcs in final.get("results", {}).items():
        for func, output in funcs.items():
            db.add(FunctionAnalysis(
                orchestration_id=orchestration_id,
                function_name=f"{dept} / {func}",
                status="completed" if output else "failed",
                result=output or None,
            ))
    await db.commit()


async def run_network(
    orchestration_id: int,
    client_id: int,
    description: str,
    db: AsyncSession,
) -> dict:
    """Фоновый прогон сети агентов (вызывается из Celery с mode="network")."""
    client = await db.get(Client, client_id)
    client_name = client.name if client else f"Клиент #{client_id}"

    topology = await load_topology(db)
    graph = build_graph()
    initial = _initial_state(orchestration_id, client_id, client_name, description, topology)

    final = await graph.ainvoke(initial, config={"recursion_limit": _RECURSION_LIMIT})

    await _persist_analyses(db, orchestration_id, final)
    return _results_payload(client_name, description, final)


async def stream_network(
    db: AsyncSession,
    orchestration_id: int,
) -> AsyncGenerator[str, None]:
    """Live-прогон сети агентов с SSE-стримингом trace.

    Yield: строки `data: {...}\\n\\n`. По завершении пишет результаты в
    OrchestrationRun и шлёт событие `done` с консолидированным планом.
    """
    run = await db.get(OrchestrationRun, orchestration_id)
    if not run:
        yield f"data: {json.dumps({'error': 'Orchestration not found'})}\n\n"
        return

    run.status = "running"
    await db.commit()

    client = await db.get(Client, run.client_id)
    client_name = client.name if client else f"Клиент #{run.client_id}"

    topology = await load_topology(db)
    graph = build_graph()
    initial = _initial_state(orchestration_id, run.client_id, client_name, run.description, topology)

    emitted = 0
    last_state: dict | None = None
    try:
        async for state in graph.astream(
            initial,
            stream_mode="values",
            config={"recursion_limit": _RECURSION_LIMIT},
        ):
            last_state = state
            trace = state.get("trace", [])
            for entry in trace[emitted:]:
                yield f"data: {json.dumps(entry, ensure_ascii=False)}\n\n"
            emitted = len(trace)
    except Exception as exc:
        # Сохраняем НАКОПЛЕННЫЙ прогресс (частичный trace/результаты), чтобы
        # ошибку и контекст её появления можно было разобрать позже через GET.
        partial = last_state or initial
        try:
            await _persist_analyses(db, orchestration_id, partial)
        except Exception:
            await db.rollback()
        run = await db.get(OrchestrationRun, orchestration_id)
        run.status = "failed"
        run.error = str(exc)
        run.results = _results_payload(client_name, run.description, partial)
        run.completed_at = datetime.utcnow()
        await db.commit()
        yield f"data: {json.dumps({'error': str(exc)}, ensure_ascii=False)}\n\n"
        return

    final = last_state or initial
    await _persist_analyses(db, orchestration_id, final)

    run = await db.get(OrchestrationRun, orchestration_id)
    run.status = "completed"
    run.results = _results_payload(client_name, run.description, final)
    run.completed_at = datetime.utcnow()
    await db.commit()

    yield f"data: {json.dumps({'done': True, 'consolidated_plan': final.get('consolidated', '')}, ensure_ascii=False)}\n\n"
