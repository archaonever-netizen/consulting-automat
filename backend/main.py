import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select

from .core.config import get_settings
from .core.database import AsyncSessionLocal, Base, engine
from .models import User
from .routes import auth, clients, briefs, company, tasks, agent, chat, knowledge
from .services.knowledge import seed_if_empty

settings = get_settings()

# Путь к собранному фронтенду (frontend/dist лежит рядом с backend/)
_DIST = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "frontend", "dist"))


async def _seed_founder():
    """Создать основателя при первом запуске, если БД пустая.

    Берёт креды из env FOUNDER_EMAIL / FOUNDER_PASSWORD (иначе пропускает).
    Без этого на свежей БД некому войти.
    """
    email = os.getenv("FOUNDER_EMAIL")
    password = os.getenv("FOUNDER_PASSWORD")
    if not email or not password:
        return
    async with AsyncSessionLocal() as db:
        existing = await db.execute(select(User).limit(1))
        if existing.scalar_one_or_none() is not None:
            return
        founder = User(
            email=email,
            full_name=os.getenv("FOUNDER_NAME", "Основатель"),
            is_founder=True,
        )
        founder.set_password(password)
        db.add(founder)
        await db.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables on startup (dev only — prod uses Alembic)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await _seed_founder()
    async with AsyncSessionLocal() as db:
        await seed_if_empty(db)
    yield
    # Cleanup on shutdown
    await engine.dispose()


app = FastAPI(
    title="ШЕФ Consulting API",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health():
    return {"status": "ok"}


# Register routers
app.include_router(auth.router, prefix="/api", tags=["auth"])
app.include_router(clients.router, prefix="/api/clients", tags=["clients"])
app.include_router(briefs.router, prefix="/api/briefs", tags=["briefs"])
app.include_router(company.router, prefix="/api/company", tags=["company"])
app.include_router(tasks.router, prefix="/api/tasks", tags=["tasks"])
app.include_router(agent.router, prefix="/api/agent", tags=["agent"])
app.include_router(chat.router, prefix="/api/chat", tags=["chat"])
app.include_router(knowledge.router, prefix="/api/knowledge", tags=["knowledge"])


# ── Раздача собранного фронтенда (SPA) ──
# Должно идти ПОСЛЕ API-роутов, чтобы не перехватывать /api/*.
if os.path.isdir(_DIST):
    app.mount("/assets", StaticFiles(directory=os.path.join(_DIST, "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # /api/* сюда попадать не должен, но на всякий случай отдаём 404
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found")
        candidate = os.path.join(_DIST, full_path)
        if full_path and os.path.isfile(candidate):
            return FileResponse(candidate)
        # SPA fallback: любой неизвестный путь → index.html (клиентский роутинг)
        return FileResponse(os.path.join(_DIST, "index.html"))
