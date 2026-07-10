"""Заявки с лендинга: создание, список, смена статуса, удаление, фиксация согласия.

Реальная in-memory SQLite (как прод-схема через Base.metadata.create_all),
без HTTP-слоя — тестируем сервис, который вызывают роуты.
"""
import asyncio
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from backend.core.database import Base
from backend.models import Lead  # noqa: F401 — регистрация таблицы
from backend.schemas.leads import LeadCreate
from backend.services import leads as lead_service


async def _setup():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    return engine, session_factory()


def test_create_records_consent_and_appears_in_list():
    async def run():
        engine, db = await _setup()
        try:
            data = LeadCreate(
                name="  Иван  ",
                contact="@ivan",
                note="  всё зависает на мне  ",
                consent=True,
                consent_at=datetime(2026, 7, 7, 10, 0, 0),
                policy_version="2026-07-07",
                source="/",
            )
            created = await lead_service.create_lead(db, data, ip="1.2.3.4", user_agent="pytest")
            # Поля тримятся, согласие зафиксировано вместе с версией и временем.
            assert created["name"] == "Иван"
            assert created["note"] == "всё зависает на мне"
            assert created["status"] == "new"
            assert created["consent"] is True
            assert created["policy_version"] == "2026-07-07"
            assert created["consent_at"] == datetime(2026, 7, 7, 10, 0, 0)

            listed = await lead_service.list_leads(db)
            assert [x["id"] for x in listed] == [created["id"]]
        finally:
            await db.close()
            await engine.dispose()

    asyncio.run(run())


def test_status_update_and_delete():
    async def run():
        engine, db = await _setup()
        try:
            created = await lead_service.create_lead(
                db, LeadCreate(name="Пётр", contact="+7 900 000-00-00", consent=True)
            )
            lead_id = created["id"]

            updated = await lead_service.update_status(db, lead_id, "in_progress")
            assert updated is not None and updated["status"] == "in_progress"

            # Фильтр по статусу.
            assert len(await lead_service.list_leads(db, status="in_progress")) == 1
            assert len(await lead_service.list_leads(db, status="new")) == 0

            # Несуществующая заявка.
            assert await lead_service.update_status(db, 999, "done") is None

            assert await lead_service.delete_lead(db, lead_id) is True
            assert await lead_service.delete_lead(db, lead_id) is False
            assert await lead_service.list_leads(db) == []
        finally:
            await db.close()
            await engine.dispose()

    asyncio.run(run())
