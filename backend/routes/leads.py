"""Приём заявок с публичного лендинга и их обработка командой.

POST /api/leads — ПУБЛИЧНЫЙ (без авторизации): его дёргает форма лендинга.
Защита от абуза — honeypot + per-IP лимит в памяти процесса (прод работает
одним процессом uvicorn, см. Dockerfile). Остальные методы — только для
авторизованных сотрудников (раздел «Заявки»).
"""
import time
from collections import defaultdict, deque

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.database import get_db
from ..routes.auth import get_current_user_dep
from ..schemas.leads import LeadCreate, LeadStatusUpdate
from ..services import leads as lead_service
from ..services.leads import ALLOWED_STATUS

router = APIRouter()

# Per-IP лимит на публичный POST: не более _LIMIT заявок за _WINDOW секунд.
_HITS: dict[str, deque] = defaultdict(deque)
_LIMIT = 5
_WINDOW = 60.0


def _client_ip(request: Request) -> str:
    # За обратным прокси (Amvera) реальный IP — в X-Forwarded-For.
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _rate_ok(ip: str) -> bool:
    q = _HITS[ip]
    now = time.monotonic()
    while q and now - q[0] > _WINDOW:
        q.popleft()
    if len(q) >= _LIMIT:
        return False
    q.append(now)
    return True


@router.post("", status_code=status.HTTP_201_CREATED)
async def submit_lead(
    data: LeadCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    # Honeypot: скрытое поле заполняют только боты. Тихо отвечаем «ок», ничего
    # не сохраняя — не даём боту понять, что сработал фильтр.
    if (data.website or "").strip():
        return {"ok": True}
    # Согласие на обработку ПДн обязательно (152-ФЗ).
    if not data.consent:
        raise HTTPException(
            status_code=422,
            detail="Требуется согласие на обработку персональных данных",
        )
    ip = _client_ip(request)
    if not _rate_ok(ip):
        raise HTTPException(
            status_code=429,
            detail="Слишком много заявок. Попробуйте через минуту.",
        )
    await lead_service.create_lead(
        db, data, ip=ip, user_agent=request.headers.get("user-agent")
    )
    return {"ok": True}


@router.get("")
async def list_leads(
    status: str | None = Query(default=None),
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    return await lead_service.list_leads(db, status)


@router.patch("/{lead_id}")
async def update_lead_status(
    lead_id: int,
    data: LeadStatusUpdate,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    if data.status not in ALLOWED_STATUS:
        raise HTTPException(status_code=400, detail="Недопустимый статус")
    updated = await lead_service.update_status(db, lead_id, data.status)
    if updated is None:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    return updated


@router.delete("/{lead_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_lead(
    lead_id: int,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    ok = await lead_service.delete_lead(db, lead_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
