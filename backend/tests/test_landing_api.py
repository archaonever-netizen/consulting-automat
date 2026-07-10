"""HTTP-слой контента лендинга: GET публичный, PUT под авторизацией.

Изолированное приложение только с роутером landing (без lifespan основного
app), get_db и авторизация подменены на тестовые. Проверяем маршрут,
сериализацию и upsert через реальный HTTP-клиент.
"""
import asyncio

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from backend.core.database import Base, get_db
from backend.models import LandingContent  # noqa: F401 — регистрация таблицы
from backend.routes import landing as landing_routes
from backend.routes.auth import get_current_user_dep


def test_get_public_and_put_roundtrip():
    async def run():
        engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

        async def override_get_db():
            async with factory() as s:
                yield s

        app = FastAPI()
        app.include_router(landing_routes.router, prefix="/api/landing")
        app.dependency_overrides[get_db] = override_get_db
        # Авторизацию подменяем на «залогиненного» — проверяем сам роут, а не JWT.
        app.dependency_overrides[get_current_user_dep] = lambda: {"id": 1}

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            # Публичное чтение: контента ещё нет — data=null (лендинг возьмёт дефолты).
            r = await ac.get("/api/landing/content")
            assert r.status_code == 200
            assert r.json()["data"] is None

            # Сохранение документа.
            payload = {"data": {"hero": {"title": "Новый заголовок"}, "faq": {"items": []}}}
            r = await ac.put("/api/landing/content", json=payload)
            assert r.status_code == 200
            assert r.json()["data"]["hero"]["title"] == "Новый заголовок"
            assert r.json()["updated_at"] is not None

            # Читаем обратно — сохранённое отдаётся.
            r = await ac.get("/api/landing/content")
            assert r.json()["data"]["hero"]["title"] == "Новый заголовок"

            # Повторный PUT перезаписывает тот же документ.
            r = await ac.put("/api/landing/content", json={"data": {"hero": {"title": "Ещё раз"}}})
            assert r.status_code == 200
            r = await ac.get("/api/landing/content")
            assert r.json()["data"]["hero"]["title"] == "Ещё раз"

        await engine.dispose()

    asyncio.run(run())
