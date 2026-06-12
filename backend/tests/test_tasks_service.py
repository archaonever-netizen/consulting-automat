"""CRUD задач: создание, частичное редактирование, завершение, изоляция владельца.

Реальная in-memory SQLite (как прод-схема через Base.metadata.create_all),
без HTTP-слоя — тестируем сервис, который вызывают роуты.
"""
import asyncio

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from backend.core.database import Base
from backend.models import Client, TaskCompletion, User, UserTask  # noqa: F401 — регистрация таблиц
from backend.schemas.tasks import TaskComplete, TaskCreate, TaskUpdate
from backend.services import tasks as task_service


async def _setup():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    db = session_factory()
    owner = User(email="owner@test.local", full_name="Owner")
    owner.set_password("x")
    stranger = User(email="stranger@test.local", full_name="Stranger")
    stranger.set_password("x")
    client = Client(name="Тестовый клиент")
    db.add_all([owner, stranger, client])
    await db.commit()
    return engine, db, owner, stranger, client


def test_create_update_complete_flow():
    async def run():
        engine, db, owner, _, client = await _setup()
        try:
            task = await task_service.create_task(
                db, TaskCreate(title="Позвонить клиенту", client_id=client.id), owner.id
            )
            assert task.status == "pending"

            # Частичное обновление: меняется только переданное поле
            updated = await task_service.update_task(
                db, task.id, TaskUpdate(goal="Договориться о встрече"), owner.id
            )
            assert updated is not None
            assert updated.goal == "Договориться о встрече"
            assert updated.title == "Позвонить клиенту"

            done = await task_service.complete_task(
                db, task.id, TaskComplete(actual_result="Встреча назначена"), owner.id
            )
            assert done is not None
            assert done.status == "completed"
            assert done.completion is not None
            assert done.completion.actual_result == "Встреча назначена"

            # Повторное завершение перезаписывает результат, а не падает на unique
            done2 = await task_service.complete_task(
                db, task.id, TaskComplete(actual_result="Уточнено", is_failure=True), owner.id
            )
            assert done2.status == "failed"
            assert done2.completion.actual_result == "Уточнено"
        finally:
            await db.close()
            await engine.dispose()

    asyncio.run(run())


def test_owner_isolation():
    async def run():
        engine, db, owner, stranger, client = await _setup()
        try:
            task = await task_service.create_task(
                db, TaskCreate(title="Личная задача", client_id=client.id), owner.id
            )
            # Чужие задачи невидимы и неизменяемы — выглядят как 404
            assert await task_service.get_task(db, task.id, stranger.id) is None
            assert await task_service.update_task(db, task.id, TaskUpdate(title="x"), stranger.id) is None
            assert await task_service.complete_task(db, task.id, TaskComplete(), stranger.id) is None
            assert await task_service.delete_task(db, task.id, stranger.id) is False
            # Владелец удаляет; завершение удалённой — 404
            assert await task_service.delete_task(db, task.id, owner.id) is True
            assert await task_service.complete_task(db, task.id, TaskComplete(), owner.id) is None
        finally:
            await db.close()
            await engine.dispose()

    asyncio.run(run())


def test_tasks_routes_registered():
    from backend.main import app

    paths = {getattr(r, "path", None) for r in app.routes}
    assert "/api/tasks" in paths
    assert "/api/tasks/{task_id}" in paths
    assert "/api/tasks/{task_id}/complete" in paths
