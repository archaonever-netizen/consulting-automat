import asyncio

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from backend.core.database import Base
from backend.models import Client, ClientDocument  # noqa: F401
from backend.services import client_documents as docs_service


async def _setup():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    db = session_factory()
    client = Client(name="Acme")
    db.add(client)
    await db.commit()
    await db.refresh(client)
    return engine, db, client


def test_create_yandex_disk_document():
    async def run():
        engine, db, client = await _setup()
        try:
            created = await docs_service.create_yandex_disk_document(
                db,
                client.id,
                title="Финальный отчёт",
                url="https://disk.yandex.ru/i/example",
            )
            assert created is not None
            assert created["title"] == "Финальный отчёт"
            assert created["source_type"] == docs_service.SOURCE_YANDEX_DISK
            assert created["source_label"] == "Яндекс Диск"

            listed = await docs_service.list_documents(db, client.id)
            assert len(listed) == 1
            assert listed[0]["source_type"] == docs_service.SOURCE_YANDEX_DISK
        finally:
            await db.close()
            await engine.dispose()

    asyncio.run(run())


def test_yandex_disk_url_validation():
    with pytest.raises(ValueError):
        docs_service.normalize_yandex_disk_url("https://example.com/file")

    assert (
        docs_service.normalize_yandex_disk_url("https://disk.yandex.ru/d/example")
        == "https://disk.yandex.ru/d/example"
    )
