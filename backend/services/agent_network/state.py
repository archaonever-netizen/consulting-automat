"""Состояние графа сети агентов (LangGraph State).

Узлы графа = отделы (`Department`), рёбра = `FunctionDepartmentLink`
(executor/consumer/supplier). По состоянию ходят запросы между агентами,
накапливаются результаты и пишется trace для SSE.
"""
from typing import Annotated, TypedDict
import operator


def _merge_results(left: dict, right: dict) -> dict:
    """Глубокое слияние {dept: {function: output}}.

    `operator.or_` на верхнем уровне затёр бы все функции отдела при втором
    обновлении того же отдела, поэтому сливаем вложенный уровень вручную.
    """
    out = {dept: dict(funcs) for dept, funcs in left.items()}
    for dept, funcs in right.items():
        merged = dict(out.get(dept, {}))
        merged.update(funcs)
        out[dept] = merged
    return out


class AgentNetworkState(TypedDict):
    # связь с прогоном
    orchestration_id: int
    client_id: int
    client_name: str
    project_description: str

    # снимок топологии из БД (функции / отделы / рёбра). Read-only во время
    # прогона: узлы его не возвращают, поэтому он переносится между шагами как есть.
    topology: dict

    # очередь запросов между агентами (consumer -> executor -> supplier).
    # элемент: {from_dept, to_dept, function, question, _defer}
    pending_requests: list[dict]

    # накопленные результаты по отделам/функциям: {dept_name: {function: output}}
    results: Annotated[dict, _merge_results]

    # защита от циклов: какие (dept, function) уже взяты в работу (enqueued/done)
    visited: Annotated[set, operator.or_]

    # лог шагов для стриминга прогресса в SSE: [{node, status, ts}]
    trace: Annotated[list, operator.add]

    # итоговый консолидированный план (заполняет consolidator)
    consolidated: str
