from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.database import get_db
from ..routes._ratelimit import rate_limit
from ..routes.auth import get_current_user_dep
from ..schemas.projects import CardValidateRequest, ProjectCreate, ProjectUpdate
from ..services import card_validator, projects as project_service

router = APIRouter()


@router.post("/cards/validate", dependencies=[Depends(rate_limit("card_validate", 15))])
async def validate_card(
    data: CardValidateRequest,
    current_user=Depends(get_current_user_dep),
):
    """Проверить заполнение карточки фреймворка проекта строго по методологиям из RAG.

    Платный ИИ-вызов (гибридный поиск + модель), поэтому per-user rate limit.
    Гибридный поиск требует Postgres/pgvector → на dev SQLite ожидаемый 503.
    """
    if not data.content:
        raise HTTPException(status_code=400, detail="Карточка не заполнена")
    try:
        return await card_validator.validate_card(data.card_title, data.content)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@router.get("")
async def list_projects(
    client_id: int | None = Query(default=None),
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    return await project_service.list_projects(db, client_id=client_id)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_project(
    data: ProjectCreate,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    project = await project_service.create_project(db, data)
    if project is None:
        raise HTTPException(status_code=404, detail="Client not found")
    return {"id": project.id, "client_id": project.client_id, "name": project.name}


@router.get("/{project_id}")
async def get_project(
    project_id: int,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    project = await project_service.get_project(db, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.put("/{project_id}")
async def update_project(
    project_id: int,
    data: ProjectUpdate,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    project = await project_service.update_project(db, project_id, data)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"id": project.id, "client_id": project.client_id, "name": project.name}


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: int,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    success = await project_service.delete_project(db, project_id)
    if not success:
        raise HTTPException(status_code=404, detail="Project not found")
