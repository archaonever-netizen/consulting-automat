from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from ..models import Client, Project
from ..schemas.projects import ProjectCreate, ProjectUpdate


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
