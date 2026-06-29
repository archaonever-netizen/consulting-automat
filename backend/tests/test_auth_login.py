import asyncio

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from backend.core.database import Base
from backend.models import Client, ClientUser, User
from backend.routes import auth as auth_routes
from backend.schemas.auth import LoginRequest
from backend.services import portal_auth


async def _setup():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    db = session_factory()

    app_user = User(
        email="manager@example.com",
        full_name="Manager",
        is_founder=False,
        is_active=True,
    )
    app_user.set_password("manager-secret")

    client = Client(name="Acme")
    portal_user = ClientUser(
        client=client,
        email="client@example.com",
        full_name="Client User",
        role="Sponsor",
        sections=["project"],
        is_active=True,
    )
    portal_user.set_password("client-secret")

    db.add_all([app_user, client, portal_user])
    await db.commit()
    await db.refresh(app_user)
    await db.refresh(client)
    await db.refresh(portal_user)
    return engine, db, app_user, client, portal_user


def test_app_login_keeps_internal_session_type():
    async def run():
        engine, db, app_user, _, _ = await _setup()
        try:
            response = await auth_routes.login(
                LoginRequest(email=app_user.email, password="manager-secret"),
                db,
            )

            assert response.session_type == "app"
            assert response.redirect_to is None
            assert response.access_token
        finally:
            await db.close()
            await engine.dispose()

    asyncio.run(run())


def test_common_login_accepts_client_portal_user():
    async def run():
        engine, db, _, client, portal_user = await _setup()
        try:
            response = await auth_routes.login(
                LoginRequest(email=" CLIENT@example.com ", password="client-secret"),
                db,
            )

            assert response.session_type == "portal"
            assert response.redirect_to == "/portal.html"

            identity = await portal_auth.resolve_identity(response.access_token, db)
            assert identity.client_id == client.id
            assert identity.user_id == portal_user.id
            assert identity.sections == ["project"]
        finally:
            await db.close()
            await engine.dispose()

    asyncio.run(run())


def test_common_login_rejects_unknown_credentials():
    async def run():
        engine, db, _, _, _ = await _setup()
        try:
            with pytest.raises(HTTPException) as exc:
                await auth_routes.login(
                    LoginRequest(email="missing@example.com", password="nope"),
                    db,
                )
            assert exc.value.status_code == 401
        finally:
            await db.close()
            await engine.dispose()

    asyncio.run(run())
