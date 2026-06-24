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


def test_portal_projects_include_only_finished_public_compositions():
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
                    card_id="__composition__:diagnosis",
                    content_json={
                        "status": "done",
                        "stage_no": 4,
                        "draft": {"manifest": "internal draft", "composition": "draft"},
                        "recommendations": {"verdict": "revise", "recommendations": ["hidden"]},
                        "final": {
                            "manifest": "Главное ограничение найдено.",
                            "composition": "Проблема связана с разрывом между планом и фактом.",
                        },
                    },
                ),
                ProjectCardState(
                    project_id=created.id,
                    card_id="__composition__:hypotheses",
                    content_json={
                        "status": "reviewing",
                        "structured": {"manifest": "hidden", "composition": "hidden"},
                    },
                ),
            ])
            await db.commit()

            projects = await project_service.list_portal_projects(db, client_id=client.id)

            assert len(projects) == 1
            assert len(projects[0]["sections"]) == 1
            section = projects[0]["sections"][0]
            assert section["updated_at"] is not None
            assert {k: section[k] for k in ("id", "title", "order", "summary", "body")} == {
                "id": "diagnosis",
                "title": "Диагноз",
                "order": 2,
                "summary": "Главное ограничение найдено.",
                "body": "Проблема связана с разрывом между планом и фактом.",
            }
        finally:
            await db.close()
            await engine.dispose()

    asyncio.run(run())


def test_projects_routes_registered():
    from backend.main import app

    paths = {getattr(route, "path", None) for route in app.routes}
    assert "/api/projects" in paths
    assert "/api/projects/{project_id}" in paths
