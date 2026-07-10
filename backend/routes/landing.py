"""Контент публичного лендинга.

GET /api/landing/content — ПУБЛИЧНЫЙ (без авторизации): его дёргает сам лендинг,
чтобы взять актуальный текст. Если текст ещё не сохраняли — вернётся data=null,
и лендинг покажет вшитые дефолты.

PUT /api/landing/content — только авторизованные сотрудники (редактор в
приложении, раздел «Лендинг»). Сохраняет документ целиком.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.database import get_db
from ..routes.auth import get_current_user_dep
from ..schemas.landing import LandingContentRead, LandingContentUpdate
from ..services import landing as landing_service

router = APIRouter()


@router.get("/content", response_model=LandingContentRead)
async def get_landing_content(db: AsyncSession = Depends(get_db)):
    row = await landing_service.get_content(db)
    if row is None:
        return LandingContentRead(data=None, updated_at=None)
    return LandingContentRead(data=row.data, updated_at=row.updated_at)


@router.put("/content", response_model=LandingContentRead)
async def put_landing_content(
    body: LandingContentUpdate,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    row = await landing_service.save_content(db, body.data)
    return LandingContentRead(data=row.data, updated_at=row.updated_at)
