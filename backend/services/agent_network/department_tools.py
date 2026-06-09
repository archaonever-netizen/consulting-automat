"""Микро-слой: чистые функции-тулзы отделов.

Содержит:
- хелперы сборки контекста запроса (supplier_pairs_for / collect_supplier_outputs /
  format_supplier_context);
- реестр «фич/фреймворков функций» `DEPARTMENT_TOOLS` — чистые детерминированные
  функции (не методы класса), каждая возвращает текстовый каркас (SWOT, реестр
  рисков, чек-лист, RACI). `department_agent` динамически выбирает подходящие
  тулзы (выбор — JSON-парсингом, т.к. Promptra может не поддерживать
  function-calling) и подкладывает их каркасы в синтез-промпт.

Тулзы намеренно generic (консалтинговые фреймворки): домен-специфику отделов
добавляют сюда же новыми чистыми функциями + записью в DEPARTMENT_TOOLS.
"""
from __future__ import annotations

from typing import Callable


def supplier_pairs_for(topology: dict, function_name: str) -> list[tuple[str, str]]:
    """Поставщики функции в виде пар (supplier_dept, функция_которую_он_исполняет).

    Поставщик функции F — это отдел, который что-то поставляет в F. Чтобы получить
    его вклад, мы просим этот отдел выполнить ЕГО собственную функцию (executor-ребро
    отдела). Так строится цепочка по реальным рёбрам графа.
    """
    pairs: list[tuple[str, str]] = []
    fn = topology["functions"].get(function_name, {})
    seen: set[tuple[str, str]] = set()
    for dept in fn.get("suppliers", []):
        for executed in topology["dept_functions"].get(dept, []):
            if executed == function_name:
                continue
            pair = (dept, executed)
            if pair not in seen:
                seen.add(pair)
                pairs.append(pair)
    return pairs


def collect_supplier_outputs(
    results: dict, supplier_pairs: list[tuple[str, str]]
) -> dict[str, str]:
    """Собрать уже готовые результаты поставщиков из общего состояния."""
    out: dict[str, str] = {}
    for dept, func in supplier_pairs:
        val = results.get(dept, {}).get(func)
        if val:
            out[f"{dept} / {func}"] = val
    return out


def format_supplier_context(supplier_outputs: dict[str, str]) -> str:
    """Текстовое представление входов от смежных отделов для промпта."""
    if not supplier_outputs:
        return "(нет входных данных от смежных отделов)"
    return "\n\n".join(f"### {key}:\n{value}" for key, value in supplier_outputs.items())


# ───────────────────── фреймворки функций (чистые тулзы) ─────────────────────
# Каждая тулза: (ctx: dict) -> str. ctx содержит function, dept, project, client.
# Возвращает каркас фреймворка, который синтез-LLM наполняет конкретикой.

def _swot_framework(ctx: dict) -> str:
    return (
        f"Каркас SWOT для функции «{ctx['function']}» (отдел «{ctx['dept']}»):\n"
        "- Strengths (сильные стороны): …\n"
        "- Weaknesses (слабые стороны): …\n"
        "- Opportunities (возможности): …\n"
        "- Threats (угрозы): …"
    )


def _risk_register(ctx: dict) -> str:
    return (
        f"Реестр рисков для функции «{ctx['function']}». На каждый риск:\n"
        "| Риск | Вероятность (Н/С/В) | Влияние (Н/С/В) | Митигация |\n"
        "|------|---------------------|------------------|-----------|\n"
        "| … | … | … | … |"
    )


def _action_checklist(ctx: dict) -> str:
    return (
        f"Чек-лист первых шагов по функции «{ctx['function']}» "
        f"(проект: {ctx['project'][:80]}…):\n"
        "1. … (что, кто, к какому сроку)\n"
        "2. …\n"
        "3. …"
    )


def _raci_matrix(ctx: dict) -> str:
    return (
        f"RACI по функции «{ctx['function']}» (R=исполнитель, A=ответственный, "
        "C=консультант, I=информируемый):\n"
        "| Задача | R | A | C | I |\n"
        "|--------|---|---|---|---|\n"
        "| … | … | … | … | … |"
    )


DEPARTMENT_TOOLS: dict[str, dict[str, object]] = {
    "swot": {
        "description": "SWOT-анализ: сильные/слабые стороны, возможности, угрозы. "
                       "Для стратегических/коммерческих функций.",
        "run": _swot_framework,
    },
    "risk_register": {
        "description": "Реестр рисков с вероятностью/влиянием и митигацией. "
                       "Для функций с операционными/техническими рисками.",
        "run": _risk_register,
    },
    "action_checklist": {
        "description": "Чек-лист конкретных первых шагов с ответственными и сроками. "
                       "Универсален почти для любой функции.",
        "run": _action_checklist,
    },
    "raci": {
        "description": "RACI-матрица распределения ролей. Когда в функции участвуют "
                       "несколько отделов/ролей.",
        "run": _raci_matrix,
    },
}


def available_tools_brief() -> str:
    """Список тулз с описаниями — для промпта-селектора."""
    return "\n".join(
        f"- {name}: {meta['description']}" for name, meta in DEPARTMENT_TOOLS.items()
    )


def run_tools(names: list[str], ctx: dict) -> dict[str, str]:
    """Выполнить выбранные тулзы (чистые функции). Неизвестные имена игнорируются."""
    out: dict[str, str] = {}
    for name in names:
        meta = DEPARTMENT_TOOLS.get(name)
        if not meta:
            continue
        run: Callable[[dict], str] = meta["run"]  # type: ignore[assignment]
        try:
            out[name] = run(ctx)
        except Exception:
            continue
    return out


def format_frameworks(frameworks: dict[str, str]) -> str:
    """Текстовое представление выбранных каркасов для синтез-промпта."""
    if not frameworks:
        return "(без явного фреймворка — структурируй ответ по своему усмотрению)"
    return "\n\n".join(frameworks.values())
