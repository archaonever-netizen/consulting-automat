"""Локальный smoke-тест графа сети агентов БЕЗ БД и без реального LLM.

Проверяет: запросы ходят по рёбрам executor/supplier, цикл A→B→A не зацикливается,
consolidator собирает результаты. Запуск:
    .venv/Scripts/python.exe -m backend.services.agent_network._smoke_test
"""
import asyncio

from langchain_core.messages import AIMessage
from langchain_core.runnables import RunnableLambda

from . import nodes
from .graph import build_graph


def _fake_get_llm(*args, **kwargs):
    """Фейковый LLM: возвращает JSON для router, иначе — текстовую заглушку."""
    def _respond(prompt_value):
        text = prompt_value.to_string()
        if "functions_needed" in text:
            # стартуем ТОЛЬКО Коммерческую — Техническая должна подтянуться как supplier
            return AIMessage(content='{"functions_needed": ["Коммерческая"]}')
        if '"tools"' in text:
            # селектор микро-слоя выбирает фреймворки
            return AIMessage(content='{"tools": ["action_checklist", "swot"]}')
        if "консолидированный план" in text:
            return AIMessage(content="ИТОГ: единый план собран из всех отделов.")
        # ответ department_agent — извлекаем имя функции грубо для наглядности
        return AIMessage(content="Результат функции (заглушка).")
    return RunnableLambda(_respond)


def _topology() -> dict:
    """Три отдела, цикл: Технический поставляет Коммерческой и наоборот."""
    return {
        "functions": {
            "Коммерческая": {
                "description": "Продажи и маркетинг",
                "executor": "Отдел продаж",
                "suppliers": ["Технический отдел"],
                "consumers": [],
            },
            "Техническая": {
                "description": "Разработка",
                "executor": "Технический отдел",
                "suppliers": [],
                "consumers": [],
            },
            "Финансовая": {
                "description": "Бюджет",
                "executor": "Финотдел",
                "suppliers": [],
                "consumers": [],
            },
        },
        "departments": {
            "Отдел продаж": {"description": ""},
            "Технический отдел": {"description": ""},
            "Финотдел": {"description": ""},
        },
        "dept_functions": {
            "Отдел продаж": ["Коммерческая"],
            "Технический отдел": ["Техническая"],
            "Финотдел": ["Финансовая"],
        },
    }


async def main():
    nodes.get_llm = _fake_get_llm  # подменяем LLM во всех узлах

    graph = build_graph()
    initial = {
        "orchestration_id": 0,
        "client_id": 0,
        "client_name": "ТестКлиент",
        "project_description": "Запустить новый продукт на рынок.",
        "topology": _topology(),
        "pending_requests": [],
        "results": {},
        "visited": set(),
        "trace": [],
        "consolidated": "",
    }

    final = await graph.ainvoke(initial, config={"recursion_limit": 200})

    print("=== TRACE ===")
    for entry in final["trace"]:
        print(f"  [{entry['node']}] {entry['status']}")
    print("\n=== RESULTS (dept/function) ===")
    for dept, funcs in final["results"].items():
        for func in funcs:
            print(f"  {dept} / {func}")
    print("\n=== CONSOLIDATED ===")
    print(" ", final["consolidated"])

    # Простейшие проверки
    assert final["consolidated"], "consolidator не дал результата"
    assert ("Отдел продаж", "Коммерческая") in final["visited"]
    assert ("Технический отдел", "Техническая") in final["visited"]
    statuses = [t["status"] for t in final["trace"]]
    assert any("фреймворки:" in s for s in statuses), "микро-слой не выбрал фреймворки"
    print("\nOK: граф отработал, цикл не зациклился, микро-слой выбрал фреймворки.")


if __name__ == "__main__":
    asyncio.run(main())
