"""Контент публичного лендинга: чтение и сохранение (singleton-строка id=1).

Документ хранится целиком в JSON-колонке. Мы не разбираем его структуру —
её держит фронтенд (frontend/src/landing/content.ts). Здесь только upsert
единственной строки.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from ..models import LandingContent

_SINGLETON_ID = 1


async def get_content(db: AsyncSession) -> LandingContent | None:
    return await db.get(LandingContent, _SINGLETON_ID)


async def save_content(db: AsyncSession, data: dict[str, Any]) -> LandingContent:
    row = await db.get(LandingContent, _SINGLETON_ID)
    if row is None:
        row = LandingContent(id=_SINGLETON_ID, data=data)
        db.add(row)
    else:
        # Присваиваем НОВЫЙ объект (не мутируем на месте) — так SQLAlchemy
        # гарантированно видит изменение JSON-поля и пишет его в БД.
        row.data = data
    await db.commit()
    await db.refresh(row)
    return row
