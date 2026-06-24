from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from ..models import Client, Project, ProjectCardState
from ..schemas.projects import ProjectCreate, ProjectUpdate

_PORTAL_SECTION_META: dict[str, tuple[int, str, str]] = {
    "project-theory": (1, "Теория проекта", "Смысл проекта, ценность, результат и ограничения."),
    "diagnosis": (2, "Диагноз", "Проблема, факты и вывод о главном ограничении."),
    "strategic-choice": (3, "Стратегический выбор", "Где играем, как выигрываем и от чего отказываемся."),
    "target-state": (4, "Целевое состояние", "Как должна выглядеть система после успешного завершения проекта."),
    "strategy-map": (5, "Стратегическая карта", "Причинно-следственная логика достижения результата."),
    "hypotheses": (6, "Гипотезы", "Ключевые предположения, от которых зависит успех проекта."),
    "experiments": (7, "Проверки", "Эксперименты и способы проверки гипотез."),
    "decisions": (8, "Решения", "Управленческие решения по результатам проверок и фактов."),
    "okr-kpi": (9, "OKR / KPI", "Измеримые цели и показатели движения к результату."),
    "initiatives": (10, "Инициативы", "Крупные действия, реализующие стратегический выбор."),
    "business-processes": (11, "Бизнес-процессы", "Процессы, которые должны стабильно воспроизводить результат."),
    "tasks": (12, "Задачи", "Конкретные действия, исполнители, сроки и статусы."),
    "facts-learning": (13, "Факты и обучение", "Фактические данные, обратная связь и выводы."),
}

_PUBLIC_LABELS = {
    "rawRequest": "Запрос",
    "requestType": "Тип запроса",
    "requestContext": "Контекст",
    "areas": "Зоны проекта",
    "keyChallenge": "Ключевой вызов",
    "obstacleType": "Тип препятствия",
    "limitingFactor": "Ограничивающий фактор",
    "scale": "Масштаб",
    "strategicConclusion": "Вывод",
    "exclusions": "Что исключено",
    "finalStatement": "Итог",
    "strategicQuestion": "Стратегический вопрос",
    "winningAspiration": "Целевой выигрыш",
    "winType": "Тип победы",
    "whereClient": "Клиент",
    "whereGeography": "География",
    "whereProduct": "Продукт",
    "whereProcess": "Процесс",
    "whereIncluded": "Включено",
    "whereExcluded": "Исключено",
    "howToWin": "Как выигрываем",
    "howValue": "Ценность",
    "howAdvantage": "Преимущество",
    "managementSystems": "Системы управления",
    "noActionConsequence": "Если ничего не менять",
    "expectedState": "Ожидаемое состояние",
    "output": "Выход раздела",
}

_GROUP_TITLES = {
    "blocks": "Логика проекта",
    "items": "Содержание раздела",
    "gaps": "Разрывы",
    "symptoms": "Симптомы",
    "facts": "Факты",
    "alternatives": "Альтернативные объяснения",
    "consequences": "Последствия",
    "verifications": "Проверки",
    "capabilities": "Способности",
    "tradeOffs": "Компромиссы",
    "actions": "Действия",
    "hypotheses": "Гипотезы",
    "results": "Результаты",
    "stakeholderValues": "Ценность для участников",
    "keyResults": "Ключевые результаты",
    "processes": "Процессы",
    "managementSystemsTargets": "Системы управления",
    "capabilityTargets": "Способности",
    "constraintTargets": "Ограничения",
    "qualityTargets": "Качество",
    "preserveTargets": "Что важно сохранить",
    "objectives": "Цели",
}

_SKIP_KEYS = {
    "id", "projectId", "sectionId", "updatedAt", "form", "status", "completedChecks", "totalChecks",
}


def _format_date(value) -> str:
    return value.strftime("%d.%m.%Y") if value else "-"


def _project_to_dict(project: Project) -> dict:
    return {
        "id": project.id,
        "client_id": project.client_id,
        "client_name": project.client.name if project.client else "",
        "name": project.name,
        "description": project.description,
        "created_at": project.created_at,
        "updated_at": project.updated_at,
        "created_at_fmt": _format_date(project.created_at),
        "updated_at_fmt": _format_date(project.updated_at),
    }


async def list_projects(db: AsyncSession, client_id: int | None = None) -> list[dict]:
    stmt = select(Project).options(joinedload(Project.client)).order_by(desc(Project.updated_at))
    if client_id is not None:
        stmt = stmt.where(Project.client_id == client_id)
    result = await db.execute(stmt)
    return [_project_to_dict(project) for project in result.scalars().all()]


def _clean(value) -> str:
    if isinstance(value, list):
        return "; ".join(filter(None, (_clean(item) for item in value)))
    if isinstance(value, (int, float)):
        return str(value)
    return value.strip() if isinstance(value, str) else ""


def _field(label: str, value) -> dict | None:
    cleaned = _clean(value)
    if not cleaned:
        return None
    return {"label": label, "value": cleaned}


def _item_title(item: dict, fallback: str) -> str:
    for key in ("title", "label", "name", "__cardName", "criterion", "objective", "indicator", "description"):
        value = _clean(item.get(key))
        if value:
            return value
    return fallback


def _item_fields(item: dict) -> list[dict]:
    fields: list[dict] = []
    summary = _field("Суть", item.get("summary"))
    if summary:
        fields.append(summary)
    for key, value in item.items():
        if key in _SKIP_KEYS or key in {"title", "label", "summary", "name", "__cardName"}:
            continue
        label = _PUBLIC_LABELS.get(key)
        if not label:
            continue
        field = _field(label, value)
        if field:
            fields.append(field)
    return fields


def _group_from_items(title: str, items: list) -> dict | None:
    public_items = []
    for index, item in enumerate(items, start=1):
        if not isinstance(item, dict):
            continue
        fields = _item_fields(item)
        if fields:
            public_items.append({
                "title": _item_title(item, f"Элемент {index}"),
                "fields": fields,
            })
    if not public_items:
        return None
    return {"title": title, "items": public_items}


def _public_compact_section(row: ProjectCardState) -> dict | None:
    content = row.content_json if isinstance(row.content_json, dict) else {}
    meta = _PORTAL_SECTION_META.get(row.card_id)
    if not meta:
        return None
    order, title, description = meta

    fields: list[dict] = []
    groups: list[dict] = []

    for key, value in content.items():
        if key in _SKIP_KEYS:
            continue
        if isinstance(value, list):
            group = _group_from_items(_GROUP_TITLES.get(key, key), value)
            if group:
                groups.append(group)
        elif isinstance(value, dict):
            # Lossless editor state lives in `form`; other dicts are usually scalar containers.
            for child_key, child_value in value.items():
                label = _PUBLIC_LABELS.get(child_key)
                if not label:
                    continue
                field = _field(label, child_value)
                if field:
                    fields.append(field)
        else:
            label = _PUBLIC_LABELS.get(key)
            if not label:
                continue
            field = _field(label, value)
            if field:
                fields.append(field)

    if not fields and not groups:
        return None

    return {
        "id": row.card_id,
        "title": title,
        "description": description,
        "order": order,
        "fields": fields,
        "groups": groups,
        "updated_at": (
            content.get("updated_at")
            or content.get("updatedAt")
            or (row.updated_at.isoformat() if row.updated_at else None)
        ),
    }


async def list_portal_projects(db: AsyncSession, client_id: int) -> list[dict]:
    """Client-facing project payload: public compact screens from the project workspace."""
    projects = await list_projects(db, client_id=client_id)
    if not projects:
        return []

    project_ids = [project["id"] for project in projects]
    rows = (await db.scalars(
        select(ProjectCardState).where(
            ProjectCardState.project_id.in_(project_ids),
            ProjectCardState.card_id.in_(list(_PORTAL_SECTION_META)),
        )
    )).all()

    sections_by_project: dict[int, list[dict]] = {project_id: [] for project_id in project_ids}
    for row in rows:
        section = _public_compact_section(row)
        if section is not None:
            sections_by_project.setdefault(row.project_id, []).append(section)

    for project in projects:
        sections = sections_by_project.get(project["id"], [])
        project["sections"] = sorted(sections, key=lambda item: (item["order"], item["title"]))
    return projects


async def get_project(db: AsyncSession, project_id: int) -> dict | None:
    result = await db.execute(
        select(Project)
        .where(Project.id == project_id)
        .options(joinedload(Project.client))
    )
    project = result.scalar_one_or_none()
    if project is None:
        return None
    return _project_to_dict(project)


async def create_project(db: AsyncSession, data: ProjectCreate) -> Project | None:
    client = await db.get(Client, data.client_id)
    if client is None:
        return None
    project = Project(
        client_id=client.id,
        name=data.name,
        description=data.description,
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return project


async def update_project(db: AsyncSession, project_id: int, data: ProjectUpdate) -> Project | None:
    project = await db.get(Project, project_id)
    if project is None:
        return None
    if data.name is not None:
        project.name = data.name
    if data.description is not None:
        project.description = data.description
    await db.commit()
    await db.refresh(project)
    return project


async def delete_project(db: AsyncSession, project_id: int) -> bool:
    project = await db.get(Project, project_id)
    if project is None:
        return False
    await db.delete(project)
    await db.commit()
    return True
