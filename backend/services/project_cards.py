"""Хранение состояния карточек фреймворка проекта в БД.

Одна строка ProjectCardState на (project_id, card_id) держит и введённое
содержимое карточки (content_json), и последний результат ИИ-валидатора
(validation_json). Сервис — тонкий слой upsert/чтения поверх модели.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Project, ProjectCardState


async def project_exists(db: AsyncSession, project_id: int) -> bool:
    return (await db.get(Project, project_id)) is not None


def _serialize(row: ProjectCardState) -> dict:
    return {
        "card_id": row.card_id,
        "content": row.content_json,
        "validation": row.validation_json,
        "validated_at": row.validated_at.isoformat() if row.validated_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


async def list_cards(db: AsyncSession, project_id: int) -> list[dict]:
    rows = (await db.scalars(
        select(ProjectCardState).where(ProjectCardState.project_id == project_id)
    )).all()
    return [_serialize(r) for r in rows]


async def _get_or_create(db: AsyncSession, project_id: int, card_id: str) -> ProjectCardState:
    row = (await db.scalars(
        select(ProjectCardState).where(
            ProjectCardState.project_id == project_id,
            ProjectCardState.card_id == card_id,
        )
    )).first()
    if row is None:
        row = ProjectCardState(project_id=project_id, card_id=card_id)
        db.add(row)
    return row


async def upsert_content(db: AsyncSession, project_id: int, card_id: str, content: dict) -> dict:
    """Сохранить введённое содержимое карточки (данные из строк/полей)."""
    row = await _get_or_create(db, project_id, card_id)
    row.content_json = content
    await db.commit()
    await db.refresh(row)
    return _serialize(row)


async def save_validation(db: AsyncSession, project_id: int, card_id: str, validation: dict) -> dict:
    """Сохранить последний результат ИИ-валидатора для карточки."""
    row = await _get_or_create(db, project_id, card_id)
    row.validation_json = validation
    row.validated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(row)
    return _serialize(row)
