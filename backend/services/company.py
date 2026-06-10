from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.orm import selectinload
from ..models import Function, Department, FunctionDepartmentLink

VALID_RELATIONS = {"executor", "consumer", "supplier"}


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
                "id": link.id,
                "function_id": f.id,
                "department_id": link.department_id,
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


# ───────────────────────── связи (CRUD) ─────────────────────────

async def create_link(
    db: AsyncSession,
    function_id: int,
    department_id: int,
    relation_type: str,
    description: str | None,
    created_by_id: int | None,
) -> FunctionDepartmentLink:
    """Создать связь функция↔отдел. Для executor — заменяет существующего.

    Возвращает созданную связь. Бросает ValueError при невалидных данных и
    при дубле (на случай гонки до срабатывания UniqueConstraint).
    """
    if relation_type not in VALID_RELATIONS:
        raise ValueError(f"Недопустимая роль связи: {relation_type}")

    func = await db.get(Function, function_id)
    if func is None:
        raise ValueError("Функция не найдена")
    dept = await db.get(Department, department_id)
    if dept is None:
        raise ValueError("Отдел не найден")

    # Одна функция = один исполнитель: убираем прежнего executor перед заменой.
    if relation_type == "executor":
        await db.execute(
            delete(FunctionDepartmentLink).where(
                FunctionDepartmentLink.function_id == function_id,
                FunctionDepartmentLink.relation_type == "executor",
            )
        )

    # Идемпотентность: если такая же связь уже есть — вернуть её.
    existing = await db.execute(
        select(FunctionDepartmentLink).where(
            FunctionDepartmentLink.function_id == function_id,
            FunctionDepartmentLink.department_id == department_id,
            FunctionDepartmentLink.relation_type == relation_type,
        )
    )
    found = existing.scalar_one_or_none()
    if found is not None:
        if description is not None:
            found.description = description
        await db.commit()
        await db.refresh(found)
        return found

    link = FunctionDepartmentLink(
        function_id=function_id,
        department_id=department_id,
        relation_type=relation_type,
        description=description,
        created_by_id=created_by_id,
    )
    db.add(link)
    await db.commit()
    await db.refresh(link)
    return link


async def delete_link(db: AsyncSession, link_id: int) -> bool:
    """Удалить связь по id. Возвращает True, если связь была найдена."""
    link = await db.get(FunctionDepartmentLink, link_id)
    if link is None:
        return False
    await db.delete(link)
    await db.commit()
    return True


# ───────────────────────── детали и обновление ─────────────────────────

def _content(value) -> list:
    """Нормализовать JSON-список содержимого (None → [])."""
    return value if isinstance(value, list) else []


async def get_function_detail(db: AsyncSession, function_id: int) -> dict | None:
    """Детали функции: описание, контент-поля и сгруппированные связи."""
    result = await db.execute(
        select(Function)
        .where(Function.id == function_id)
        .options(selectinload(Function.links).selectinload(FunctionDepartmentLink.department))
    )
    func = result.scalar_one_or_none()
    if func is None:
        return None

    def link_row(link: FunctionDepartmentLink) -> dict:
        return {
            "id": link.id,
            "department_id": link.department_id,
            "department_name": link.department.name if link.department else "—",
            "description": link.description,
        }

    health = compute_function_health(func)
    label, cls = health_label_and_class(health)
    executor = next((l for l in func.links if l.relation_type == "executor"), None)
    return {
        "id": func.id,
        "name": func.name,
        "description": func.description,
        "frameworks": _content(func.frameworks),
        "skills": _content(func.skills),
        "features": _content(func.features),
        "databases": _content(func.databases),
        "product": func.product,
        "health": health,
        "health_label": label,
        "health_cls": cls,
        "executor": link_row(executor) if executor else None,
        "consumers": [link_row(l) for l in func.links if l.relation_type == "consumer"],
        "suppliers": [link_row(l) for l in func.links if l.relation_type == "supplier"],
    }


async def get_department_detail(db: AsyncSession, department_id: int) -> dict | None:
    """Детали отдела: описание, контент-поля и сгруппированные связи (по функциям)."""
    result = await db.execute(
        select(Department)
        .where(Department.id == department_id)
        .options(selectinload(Department.links).selectinload(FunctionDepartmentLink.function))
    )
    dept = result.scalar_one_or_none()
    if dept is None:
        return None

    def link_row(link: FunctionDepartmentLink) -> dict:
        return {
            "id": link.id,
            "function_id": link.function_id,
            "function_name": link.function.name if link.function else "—",
            "description": link.description,
        }

    health = compute_department_health(dept)
    label, cls = health_label_and_class(health)
    return {
        "id": dept.id,
        "name": dept.name,
        "description": dept.description,
        "ai_employees": _content(dept.ai_employees),
        "employees": _content(dept.employees),
        "regulations": _content(dept.regulations),
        "instructions": _content(dept.instructions),
        "frameworks": _content(dept.frameworks),
        "health": health,
        "health_label": label,
        "health_cls": cls,
        "executes": [link_row(l) for l in dept.links if l.relation_type == "executor"],
        "consumes": [link_row(l) for l in dept.links if l.relation_type == "consumer"],
        "supplies": [link_row(l) for l in dept.links if l.relation_type == "supplier"],
    }


async def update_function(db: AsyncSession, function_id: int, fields: dict) -> bool:
    """Частично обновить функцию переданными полями. True — если найдена."""
    func = await db.get(Function, function_id)
    if func is None:
        return False
    for key, value in fields.items():
        setattr(func, key, value)
    await db.commit()
    return True


async def update_department(db: AsyncSession, department_id: int, fields: dict) -> bool:
    """Частично обновить отдел переданными полями. True — если найден."""
    dept = await db.get(Department, department_id)
    if dept is None:
        return False
    for key, value in fields.items():
        setattr(dept, key, value)
    await db.commit()
    return True
