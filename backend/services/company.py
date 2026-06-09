from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from ..models import Function, Department, FunctionDepartmentLink


def compute_function_health(func: Function) -> int:
    """Вычислить health функции из 4 бинарных сигналов → проценты по 25."""
    signals = [
        bool(func.description and func.description.strip()),
        func.executor_link is not None,
        len(func.consumer_links) > 0,
        len(func.supplier_links) > 0,
    ]
    return round(sum(signals) / len(signals) * 100)


def compute_department_health(dept: Department) -> int:
    """Вычислить health отдела из 3 бинарных сигналов → проценты по ~33."""
    signals = [
        bool(dept.description and dept.description.strip()),
        len(dept.executor_links) > 0,
        len(dept.consumer_links) > 0 or len(dept.supplier_links) > 0,
    ]
    return round(sum(signals) / len(signals) * 100)


def health_label_and_class(health: int) -> tuple[str, str]:
    """Преобразовать процент health в label и CSS-класс."""
    if health == 100:
        return 'Хорошее', 'up'
    elif health >= 67:
        return 'В порядке', 'up'
    elif health >= 33:
        return 'В работе', 'warn'
    elif health > 0:
        return 'Внимание', 'down'
    else:
        return 'Нет данных', 'flat'


def health_spark_color_and_state(health: int) -> tuple[str, str]:
    """Преобразовать процент health в цвет спарка и состояние."""
    if health >= 70:
        return '#16A34A', 'Хорошее состояние'
    elif health >= 45:
        return '#C2740B', 'Требует внимания'
    elif health > 0:
        return '#DC2626', 'Зона риска'
    else:
        return '#BFC0C7', 'Нет данных'


_PALETTE = ['#1D1D1F', '#2563EB', '#16A34A', '#7C3AED', '#0891B2', '#DB2777', '#EA580C']


def _func_initials(name: str) -> str:
    parts = name.split()
    return (parts[0][0] + (parts[1][0] if len(parts) > 1 else '')).upper()


async def list_company(db: AsyncSession) -> dict:
    result_funcs = await db.execute(
        select(Function).options(selectinload(Function.links))
    )
    functions = result_funcs.scalars().all()

    result_depts = await db.execute(
        select(Department).options(selectinload(Department.links))
    )
    departments = result_depts.scalars().all()

    funcs_out = []
    for f in functions:
        health = compute_function_health(f)
        label, cls = health_label_and_class(health)
        funcs_out.append({
            "id": f.id,
            "name": f.name,
            "description": f.description,
            "initials": _func_initials(f.name),
            "color": _PALETTE[f.id % len(_PALETTE)],
            "health": health,
            "health_label": label,
            "health_cls": cls,
        })

    depts_out = []
    for d in departments:
        health = compute_department_health(d)
        label, cls = health_label_and_class(health)
        depts_out.append({
            "id": d.id,
            "name": d.name,
            "description": d.description,
            "initials": _func_initials(d.name),
            "color": _PALETTE[d.id % len(_PALETTE)],
            "health": health,
            "health_label": label,
            "health_cls": cls,
        })

    matrix: dict[str, list] = {}
    for f in functions:
        for link in f.links:
            key = f"{f.id}_{link.department_id}"
            matrix.setdefault(key, []).append({
                "relation_type": link.relation_type,
                "description": link.description,
            })

    total_links = sum(len(v) for v in matrix.values())

    return {
        "functions": funcs_out,
        "departments": depts_out,
        "matrix": matrix,
        "total_functions": len(functions),
        "total_departments": len(depts_out),
        "total_links": total_links,
    }
