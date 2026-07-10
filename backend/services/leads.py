"""Заявки с публичного лендинга (форма «Оставить заявку на разбор»).

Публичный контур создаёт заявку (без авторизации, см. routes/leads.py);
команда читает и обрабатывает их со стороны приложения (раздел «Заявки»).
Хранение — обычная строка в БД, файлов нет.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Lead
from ..schemas.leads import LeadCreate

# Допустимые статусы обработки заявки командой.
ALLOWED_STATUS = {"new", "in_progress", "done"}


def _to_dict(lead: Lead) -> dict:
    return {
        "id": lead.id,
        "name": lead.name,
        "contact": lead.contact,
        "note": lead.note,
        "status": lead.status,
        "consent": lead.consent,
        "consent_at": lead.consent_at,
        "policy_version": lead.policy_version,
        "source": lead.source,
        "created_at": lead.created_at,
        "created_at_fmt": lead.created_at.strftime("%d.%m.%Y %H:%M") if lead.created_at else "—",
    }


async def create_lead(
    db: AsyncSession,
    data: LeadCreate,
    *,
    ip: str | None = None,
    user_agent: str | None = None,
) -> dict:
    lead = Lead(
        name=data.name.strip()[:200],
        contact=data.contact.strip()[:255],
        note=((data.note or "").strip() or None),
        status="new",
        consent=bool(data.consent),
        # Момент клика с клиента, если пришёл; иначе — серверное время.
        consent_at=(data.consent_at or datetime.utcnow()) if data.consent else None,
        policy_version=(data.policy_version or None),
        source=(data.source or None),
        ip=(ip or None),
        user_agent=(user_agent[:512] if user_agent else None),
    )
    db.add(lead)
    await db.commit()
    await db.refresh(lead)
    return _to_dict(lead)


async def list_leads(db: AsyncSession, status: str | None = None) -> list[dict]:
    stmt = select(Lead).order_by(Lead.created_at.desc())
    if status in ALLOWED_STATUS:
        stmt = stmt.where(Lead.status == status)
    result = await db.execute(stmt)
    return [_to_dict(x) for x in result.scalars().all()]


async def update_status(db: AsyncSession, lead_id: int, status: str) -> dict | None:
    lead = await db.get(Lead, lead_id)
    if lead is None:
        return None
    lead.status = status
    await db.commit()
    await db.refresh(lead)
    return _to_dict(lead)


async def delete_lead(db: AsyncSession, lead_id: int) -> bool:
    lead = await db.get(Lead, lead_id)
    if lead is None:
        return False
    await db.delete(lead)
    await db.commit()
    return True
