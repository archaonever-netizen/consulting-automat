"""Заявки клиента из портала (экран «Оставить заявку»).

Клиент создаёт заявку из своего контура (/api/portal); наша команда читает их
со стороны приложения (employee-side). Хранение — обычная строка в БД, файлов
нет. Точка роста: статусы/уведомления команды.
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Client, PortalRequest


def _to_dict(r: PortalRequest) -> dict:
    return {
        "id": r.id,
        "client_id": r.client_id,
        "client_user_id": r.client_user_id,
        "author_name": r.author_name,
        "subject": r.subject,
        "message": r.message,
        "contact": r.contact,
        "status": r.status,
        "created_at": r.created_at,
        "created_at_fmt": r.created_at.strftime("%d.%m.%Y %H:%M") if r.created_at else "—",
    }


async def create_request(
    db: AsyncSession,
    client_id: int,
    *,
    subject: str,
    message: str,
    contact: str | None = None,
    author_name: str = "",
    client_user_id: int | None = None,
) -> dict | None:
    client = await db.get(Client, client_id)
    if client is None:
        return None
    req = PortalRequest(
        client_id=client_id,
        client_user_id=client_user_id,
        author_name=(author_name or "").strip(),
        subject=subject.strip(),
        message=message.strip(),
        contact=((contact or "").strip() or None),
        status="new",
    )
    db.add(req)
    await db.commit()
    await db.refresh(req)
    return _to_dict(req)


async def list_requests(db: AsyncSession, client_id: int) -> list[dict]:
    result = await db.execute(
        select(PortalRequest)
        .where(PortalRequest.client_id == client_id)
        .order_by(PortalRequest.created_at.desc())
    )
    return [_to_dict(r) for r in result.scalars().all()]
