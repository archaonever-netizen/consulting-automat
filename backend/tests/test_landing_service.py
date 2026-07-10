"""Контент лендинга: upsert singleton-строки (создание и перезапись).

Реальная in-memory SQLite (как прод-схема через Base.metadata.create_all),
без HTTP-слоя — тестируем сервис, который вызывают роуты.
"""
import asyncio

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from backend.core.database import Base
from backend.models import LandingContent  # noqa: F401 — регистрация таблицы
from backend.services import landing as landing_service


async def _setup():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    return engine, session_factory()


def test_upsert_creates_then_overwrites_singleton():
    async def run():
        engine, db = await _setup()
        try:
            # Пустая БД — контента ещё нет.
            assert await landing_service.get_content(db) is None

            # Первое сохранение создаёт singleton-строку id=1.
            first = await landing_service.save_content(db, {"hero": {"title": "Первый"}})
            assert first.id == 1
            assert first.data == {"hero": {"title": "Первый"}}

            got = await landing_service.get_content(db)
            assert got is not None and got.data["hero"]["title"] == "Первый"

            # Повторное сохранение перезаписывает ту же строку (не плодит новые).
            second = await landing_service.save_content(db, {"hero": {"title": "Второй"}, "faq": []})
            assert second.id == 1
            assert second.data == {"hero": {"title": "Второй"}, "faq": []}

            got2 = await landing_service.get_content(db)
            assert got2 is not None and got2.data["hero"]["title"] == "Второй"
        finally:
            await db.close()
            await engine.dispose()

    asyncio.run(run())
