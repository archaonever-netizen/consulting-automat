from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from datetime import datetime, timezone

from ..core.database import get_db
from ..routes._ratelimit import rate_limit
from ..routes.auth import get_current_user_dep
from ..schemas.projects import (
    CardContentUpsert,
    CardValidateRequest,
    ProjectCreate,
    ProjectUpdate,
)
from ..services import card_validator, project_cards, projects as project_service

router = APIRouter()


@router.get("/{project_id}/cards")
async def list_project_cards(
    project_id: int,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    """Состояния всех карточек проекта (содержимое + последняя валидация) для гидрации UI."""
    if not await project_cards.project_exists(db, project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    return await project_cards.list_cards(db, project_id)


@router.put("/{project_id}/cards/{card_id}")
async def save_project_card(
    project_id: int,
    card_id: str,
    data: CardContentUpsert,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    """Сохранить введённое содержимое карточки (данные из полей/строк)."""
    if not await project_cards.project_exists(db, project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    return await project_cards.upsert_content(db, project_id, card_id, data.content)


@router.post(
    "/{project_id}/cards/{card_id}/validate",
    dependencies=[Depends(rate_limit("card_validate", 15))],
)
async def validate_card(
    project_id: int,
    card_id: str,
    data: CardValidateRequest,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    """Проверить заполнение карточки строго по методологиям из RAG и сохранить результат.

    Платный ИИ-вызов (гибридный поиск + модель), поэтому per-user rate limit.
    Гибридный поиск требует Postgres/pgvector → на dev SQLite ожидаемый 503.
    """
    if not await project_cards.project_exists(db, project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    if not data.content:
        raise HTTPException(status_code=400, detail="Карточка не заполнена")
    try:
        result = await card_validator.validate_card(data.card_title, data.content)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    # Сохраняем в БД компактную выжимку (без сырого raw/usage), пригодную для гидрации UI.
    validation = {
        "answer": result["answer"],
        "verdict": result["verdict"],
        "evidence": result["evidence"],
        "contentHash": data.content_hash or "",
        "checkedAt": datetime.now(timezone.utc).isoformat(),
    }
    await project_cards.save_validation(db, project_id, card_id, validation)
    return validation


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
