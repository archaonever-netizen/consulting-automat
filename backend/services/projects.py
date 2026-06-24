from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from ..models import Client, Project, ProjectCardState
from ..schemas.projects import ProjectCreate, ProjectUpdate

_COMPOSITION_PREFIX = "__composition__:"

_PORTAL_SECTION_META: dict[str, tuple[int, str]] = {
    "project-theory": (1, "Теория проекта"),
    "diagnosis": (2, "Диагноз"),
    "strategic-choice": (3, "Стратегический выбор"),
    "target-state": (4, "Целевое состояние"),
    "strategy-map": (5, "Стратегическая карта"),
    "hypotheses": (6, "Гипотезы"),
    "experiments": (7, "Проверки"),
    "decisions": (8, "Решения"),
    "okr-kpi": (9, "OKR / KPI"),
    "initiatives": (10, "Инициативы"),
    "business-processes": (11, "Бизнес-процессы"),
    "tasks": (12, "Задачи"),
    "facts-learning": (13, "Факты и обучение"),
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


def _public_composition(row: ProjectCardState) -> dict | None:
    content = row.content_json if isinstance(row.content_json, dict) else {}
    if content.get("status") != "done":
        return None
    final = content.get("final")
    if not isinstance(final, dict):
        return None

    card_id = row.card_id[len(_COMPOSITION_PREFIX):]
    order, title = _PORTAL_SECTION_META.get(card_id, (999, card_id.replace("-", " ").title()))
    summary = str(final.get("manifest") or "").strip()
    body = str(final.get("composition") or "").strip()
    if not summary and not body:
        return None
    return {
        "id": card_id,
        "title": title,
        "order": order,
        "summary": summary,
        "body": body,
        "updated_at": content.get("updated_at") or (row.updated_at.isoformat() if row.updated_at else None),
    }


async def list_portal_projects(db: AsyncSession, client_id: int) -> list[dict]:
    """Client-facing project payload: only public metadata and finished section compositions."""
    projects = await list_projects(db, client_id=client_id)
    if not projects:
        return []

    project_ids = [project["id"] for project in projects]
    rows = (await db.scalars(
        select(ProjectCardState).where(
            ProjectCardState.project_id.in_(project_ids),
            ProjectCardState.card_id.like(f"{_COMPOSITION_PREFIX}%"),
        )
    )).all()

    sections_by_project: dict[int, list[dict]] = {project_id: [] for project_id in project_ids}
    for row in rows:
        section = _public_composition(row)
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
