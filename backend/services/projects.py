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

# Фазы жизненного цикла проекта — клиентский нарратив (тот же костяк, что у
# рабочего воркспейса: PROJECT_SECTIONS во ProjectWorkspace.tsx). Портал
# группирует 13 методологических разделов в 4 понятные клиенту фазы, чтобы он
# видел историю «зачем → что поняли → план → ход», а не плоский список секций.
# (phase_order, phase_key, phase_label, phase_summary)
_PORTAL_PHASE_META: dict[str, tuple[int, str, str]] = {
    "goal": (1, "Цель проекта", "Зачем этот проект и какой результат мы считаем успехом."),
    "concept": (2, "Концепция", "Что мы поняли про ситуацию и какой выбран путь."),
    "plan": (3, "План и проверки", "Гипотезы, проверки и измеримые цели проекта."),
    "progress": (4, "Ход проекта", "Что делаем сейчас и что узнали по ходу."),
}

# Какой раздел к какой фазе относится. Разделы вне карты в портал не группируются
# (на всякий случай попадут в фазу-обзор последними — см. _public_compact_section).
_PORTAL_PHASE_BY_CARD: dict[str, str] = {
    "project-theory": "goal",
    "diagnosis": "concept",
    "strategic-choice": "concept",
    "target-state": "concept",
    "strategy-map": "concept",
    "hypotheses": "plan",
    "experiments": "plan",
    "decisions": "plan",
    "okr-kpi": "plan",
    "initiatives": "progress",
    "business-processes": "progress",
    "tasks": "progress",
    "facts-learning": "progress",
}

# Префикс синтетической строки чекпоинта композиции (см. project_cards.COMPOSITION_PREFIX).
# Дублируем константой, чтобы не вводить импорт-зависимость между сервисами.
_COMPOSITION_PREFIX = "__composition__:"

# Заглушка, которую конвейер композиции кладёт при пустом разделе — для клиента
# это «нет данных», поэтому такой текст за композицию не считаем.
_COMPOSITION_EMPTY = "В разделе пока нет данных для композиции."

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

# Внутренняя классификация — служебная для методологии, клиенту это шум.
# Прячем в fallback-выводе (в человеческой композиции её и так нет).
_CLIENT_HIDDEN_KEYS = {"requestType", "obstacleType", "winType", "scale"}


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


def _nested_item_fields(items: list) -> list[dict]:
    fields: list[dict] = []
    for index, nested in enumerate(items, start=1):
        if not isinstance(nested, dict):
            continue
        label = _item_title(nested, f"Характеристика {index}")
        value = _clean(nested.get("summary"))
        if not value:
            values = []
            for key, raw in nested.items():
                if key in _SKIP_KEYS or key in {"title", "label", "summary", "name", "__cardName"}:
                    continue
                cleaned = _clean(raw)
                if cleaned:
                    values.append(cleaned)
            value = "; ".join(values)
        field = _field(label, value)
        if field:
            fields.append(field)
    return fields


def _item_fields(item: dict) -> list[dict]:
    fields: list[dict] = []
    summary = _field("Суть", item.get("summary"))
    if summary:
        fields.append(summary)
    for key, value in item.items():
        if key in _SKIP_KEYS or key in _CLIENT_HIDDEN_KEYS or key in {"title", "label", "summary", "name", "__cardName"}:
            continue
        label = _PUBLIC_LABELS.get(key)
        if not label:
            continue
        field = _field(label, value)
        if field:
            fields.append(field)
    nested_items = item.get("items")
    if isinstance(nested_items, list):
        fields.extend(_nested_item_fields(nested_items))
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


def _composition_text(comp_content: dict | None) -> tuple[str, str]:
    """Достать (composition, manifest) из чекпоинта композиции раздела.

    Лучший доступный этап: final → structured → draft (как у фронта рабочего
    воркспейса). Текст-заглушку пустого раздела за композицию не считаем.
    """
    if not isinstance(comp_content, dict):
        return "", ""
    for key in ("final", "structured", "draft"):
        stage = comp_content.get(key)
        if not isinstance(stage, dict):
            continue
        text = str(stage.get("composition") or "").strip()
        if text and text != _COMPOSITION_EMPTY:
            return text, str(stage.get("manifest") or "").strip()
    return "", ""


def _public_compact_section(row: ProjectCardState, comp_content: dict | None = None) -> dict | None:
    content = row.content_json if isinstance(row.content_json, dict) else {}
    meta = _PORTAL_SECTION_META.get(row.card_id)
    if not meta:
        return None
    order, title, description = meta

    composition, manifest = _composition_text(comp_content)

    fields: list[dict] = []
    groups: list[dict] = []

    for key, value in content.items():
        if key in _SKIP_KEYS or key in _CLIENT_HIDDEN_KEYS:
            continue
        if isinstance(value, list):
            group = _group_from_items(_GROUP_TITLES.get(key, key), value)
            if group:
                groups.append(group)
        elif isinstance(value, dict):
            # Lossless editor state lives in `form`; other dicts are usually scalar containers.
            for child_key, child_value in value.items():
                if child_key in _CLIENT_HIDDEN_KEYS:
                    continue
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

    # Секция попадает к клиенту, если есть человеческая композиция ИЛИ хоть какие-то
    # структурные данные (fallback). Иначе пропускаем — пустых разделов клиент не видит.
    if not composition and not fields and not groups:
        return None

    phase_key = _PORTAL_PHASE_BY_CARD.get(row.card_id, "")
    phase_order, phase_label, phase_summary = _PORTAL_PHASE_META.get(
        phase_key, (99, "", "")
    )

    return {
        "id": row.card_id,
        "title": title,
        "description": description,
        "order": order,
        "phase": phase_key,
        "phase_label": phase_label,
        "phase_summary": phase_summary,
        "phase_order": phase_order,
        "composition": composition,
        "manifest": manifest,
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

    # Содержимое разделов + чекпоинты их композиции одним запросом. Композиция —
    # приоритетный источник человеческого текста для клиента (см. _composition_text),
    # её строки лежат под синтетическим card_id с префиксом _COMPOSITION_PREFIX.
    composition_ids = [f"{_COMPOSITION_PREFIX}{card_id}" for card_id in _PORTAL_SECTION_META]
    rows = (await db.scalars(
        select(ProjectCardState).where(
            ProjectCardState.project_id.in_(project_ids),
            ProjectCardState.card_id.in_(list(_PORTAL_SECTION_META) + composition_ids),
        )
    )).all()

    comp_by_project_card: dict[tuple[int, str], dict] = {}
    for row in rows:
        if isinstance(row.card_id, str) and row.card_id.startswith(_COMPOSITION_PREFIX):
            real_card_id = row.card_id[len(_COMPOSITION_PREFIX):]
            if isinstance(row.content_json, dict):
                comp_by_project_card[(row.project_id, real_card_id)] = row.content_json

    sections_by_project: dict[int, list[dict]] = {project_id: [] for project_id in project_ids}
    for row in rows:
        if not isinstance(row.card_id, str) or row.card_id.startswith(_COMPOSITION_PREFIX):
            continue
        comp_content = comp_by_project_card.get((row.project_id, row.card_id))
        section = _public_compact_section(row, comp_content)
        if section is not None:
            sections_by_project.setdefault(row.project_id, []).append(section)

    # Сортировка: сначала по фазе жизненного цикла, затем по порядку раздела внутри
    # фазы. Так фронт получает готовый к группировке по фазам поток секций.
    for project in projects:
        sections = sections_by_project.get(project["id"], [])
        project["sections"] = sorted(
            sections, key=lambda item: (item["phase_order"], item["order"], item["title"])
        )
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
