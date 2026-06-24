import asyncio

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from backend.core.database import Base
from backend.models import Client, Project, ProjectCardState  # noqa: F401
from backend.schemas.projects import ProjectCreate
from backend.services import projects as project_service


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


def test_project_requires_existing_client():
    async def run():
        engine, db, _ = await _setup()
        try:
            project = await project_service.create_project(
                db,
                ProjectCreate(client_id=999, name="Strategy"),
            )
            assert project is None
        finally:
            await db.close()
            await engine.dispose()

    asyncio.run(run())


def test_create_project_and_list_by_client():
    async def run():
        engine, db, client = await _setup()
        try:
            created = await project_service.create_project(
                db,
                ProjectCreate(
                    client_id=client.id,
                    name="Operating model",
                    description="Target process design",
                ),
            )
            assert created is not None
            assert created.client_id == client.id

            projects = await project_service.list_projects(db, client_id=client.id)
            assert len(projects) == 1
            assert projects[0]["name"] == "Operating model"
            assert projects[0]["client_id"] == client.id
            assert projects[0]["client_name"] == "Acme"
        finally:
            await db.close()
            await engine.dispose()

    asyncio.run(run())


def test_portal_projects_include_workspace_compact_sections_only():
    async def run():
        engine, db, client = await _setup()
        try:
            created = await project_service.create_project(
                db,
                ProjectCreate(client_id=client.id, name="Operating model"),
            )
            assert created is not None
            db.add_all([
                ProjectCardState(
                    project_id=created.id,
                    card_id="diagnosis",
                    content_json={
                        "projectId": created.id,
                        "updatedAt": "2026-06-24T10:00:00",
                        "keyChallenge": "Скорость принятия решений ниже требуемой.",
                        "form": {"internal": "hidden"},
                        "facts": [
                            {"id": "f1", "label": "Цикл согласования", "summary": "Средний цикл занимает 14 дней.", "status": "ready"},
                        ],
                    },
                ),
                ProjectCardState(
                    project_id=created.id,
                    card_id="hypotheses",
                    content_json={
                        "sectionId": "hypotheses",
                        "title": "Гипотезы",
                        "items": [
                            {
                                "id": "h1",
                                "label": "Сократить согласования",
                                "summary": "Один владелец решения снизит задержку.",
                                "output": "Служебный выход раздела не нужен клиенту.",
                            },
                        ],
                        "completedChecks": 1,
                        "totalChecks": 3,
                    },
                ),
                ProjectCardState(
                    project_id=created.id,
                    card_id="__composition__:project-theory",
                    content_json={
                        "status": "done",
                        "final": {"manifest": "Не показываем AI-манифест", "composition": "Не тот экран"},
                    },
                ),
            ])
            await db.commit()

            projects = await project_service.list_portal_projects(db, client_id=client.id)

            assert len(projects) == 1
            assert [section["id"] for section in projects[0]["sections"]] == ["diagnosis", "hypotheses"]
            assert all(section["updated_at"] is not None for section in projects[0]["sections"])
            diagnosis, hypotheses = projects[0]["sections"]
            assert diagnosis["fields"] == [
                {"label": "Ключевой вызов", "value": "Скорость принятия решений ниже требуемой."},
            ]
            assert diagnosis["groups"] == [{
                "title": "Факты",
                "items": [{
                    "title": "Цикл согласования",
                    "fields": [{"label": "Суть", "value": "Средний цикл занимает 14 дней."}],
                }],
            }]
            assert hypotheses["groups"] == [{
                "title": "Содержание раздела",
                "items": [{
                    "title": "Сократить согласования",
                    "fields": [{"label": "Суть", "value": "Один владелец решения снизит задержку."}],
                }],
            }]
            assert "Выход раздела" not in str(projects[0]["sections"])
            assert "Служебный выход раздела" not in str(projects[0]["sections"])
            assert all("body" not in section and "summary" not in section for section in projects[0]["sections"])
        finally:
            await db.close()
            await engine.dispose()

    asyncio.run(run())


def test_projects_routes_registered():
    from backend.main import app

    paths = {getattr(route, "path", None) for route in app.routes}
    assert "/api/projects" in paths
    assert "/api/projects/{project_id}" in paths
