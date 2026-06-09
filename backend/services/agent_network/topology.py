"""Снимок топологии сети из БД.

Превращает модели `Function` / `Department` / `FunctionDepartmentLink` в плоский
словарь, который кладётся в состояние графа. Делаем это ОДИН раз перед прогоном —
узлы графа дальше работают с чистыми данными и не лезут в БД (тулзы — чистые
функции, как требует архитектура).
"""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ...models import Department, Function, FunctionDepartmentLink


async def load_topology(db: AsyncSession) -> dict:
    """Загрузить функции, отделы и рёбра в сериализуемый словарь.

    Формат:
        {
          "functions": {name: {description, executor, suppliers[], consumers[]}},
          "departments": {name: {description}},
          "dept_functions": {dept_name: [function names it executes]},
        }
    """
    result = await db.execute(
        select(Function)
        .options(selectinload(Function.links).selectinload(FunctionDepartmentLink.department))
        .order_by(Function.sort_order)
    )
    functions = result.scalars().all()

    dept_result = await db.execute(select(Department))
    departments = dept_result.scalars().all()

    func_map: dict[str, dict] = {}
    dept_functions: dict[str, list[str]] = {}
    for f in functions:
        executor: str | None = None
        suppliers: list[str] = []
        consumers: list[str] = []
        for link in f.links:
            dname = link.department.name
            if link.relation_type == "executor":
                executor = dname
                dept_functions.setdefault(dname, []).append(f.name)
            elif link.relation_type == "supplier":
                suppliers.append(dname)
            elif link.relation_type == "consumer":
                consumers.append(dname)
        func_map[f.name] = {
            "description": f.description or "",
            "executor": executor,
            "suppliers": suppliers,
            "consumers": consumers,
        }

    dept_map = {d.name: {"description": d.description or ""} for d in departments}

    return {
        "functions": func_map,
        "departments": dept_map,
        "dept_functions": dept_functions,
    }
