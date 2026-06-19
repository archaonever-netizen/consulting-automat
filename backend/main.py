import os
import warnings
from contextlib import asynccontextmanager

from pydantic.warnings import UnsupportedFieldAttributeWarning

# FastAPI 0.115.0 ложно эмитит UnsupportedFieldAttributeWarning для моделей тела
# запроса с алиасами (alias_generator/Field(alias=...)) — сами алиасы при этом
# работают корректно (запросы проходят). В новых версиях FastAPI это исправлено;
# здесь точечно глушим шум в логах, не трогая рабочую версию фреймворка.
warnings.filterwarnings("ignore", category=UnsupportedFieldAttributeWarning)

from fastapi import FastAPI, HTTPException  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import FileResponse  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402
from sqlalchemy import select  # noqa: E402

from .core.config import get_settings  # noqa: E402
from .core.database import AsyncSessionLocal, Base, engine  # noqa: E402
from .models import User  # noqa: E402
from .routes import (  # noqa: E402
    agent,
    auth,
    bots,
    briefs,
    chat,
    clients,
    company,
    goals,
    knowledge,
    portal,
    portal_users,
    projects,
    secretary,
    sources,
    tasks,
    tracker,
)
from .services.bots import seed_bots  # noqa: E402
from .services.knowledge import seed_bpmm_source, seed_if_empty  # noqa: E402

settings = get_settings()

# Путь к собранному фронтенду (frontend/dist лежит рядом с backend/)
_DIST = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "frontend", "dist"))


async def _seed_founder():
    """Создать/обновить основателя из FOUNDER_EMAIL / FOUNDER_PASSWORD.

    env — источник истины для основателя: на старте он не только создаётся на
    пустой БД, но и обновляется (email нормализуется как при входе, пароль
    переустанавливается). Без этого смена переменных в проде не применялась —
    сид срабатывал только на пустой БД, и старая строка оставалась навсегда.

    Следствие: при каждом старте пароль основателя приводится к значению env.
    """
    email = settings.founder_email
    password = settings.founder_password
    if not email or not password:
        return
    email = email.lower().strip()  # как в authenticate_user — иначе вход не найдёт
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.is_founder.is_(True)))
        founder = result.scalar_one_or_none()
        if founder is None:
            founder = User(
                email=email,
                full_name=settings.founder_name or "Основатель",
                is_founder=True,
            )
            db.add(founder)
        else:
            founder.email = email
            if settings.founder_name:
                founder.full_name = settings.founder_name
        founder.is_active = True
        founder.set_password(password)
        await db.commit()


def _ensure_client_columns(conn):
    """Идемпотентно добавить новые колонки в clients (create_all не делает ALTER).

    Работает и для sqlite, и для postgres: проверяем фактические колонки через
    inspector и добавляем недостающие. Запуск повторно безопасен.
    """
    from sqlalchemy import inspect, text
    inspector = inspect(conn)
    existing = {c['name'] for c in inspector.get_columns('clients')}
    if 'business_size' not in existing:
        conn.execute(text(
            "ALTER TABLE clients ADD COLUMN business_size VARCHAR(20) DEFAULT 'medium'"
        ))


def _ensure_company_columns(conn):
    """Идемпотентно добавить JSON/Text-колонки контента в functions и departments.

    Создаются моделью при пустой БД через create_all; для существующих БД
    добавляем недостающие колонки вручную (как _ensure_client_columns).
    """
    from sqlalchemy import inspect, text
    inspector = inspect(conn)

    func_cols = {c['name'] for c in inspector.get_columns('functions')}
    for col in ('frameworks', 'skills', 'features', 'databases'):
        if col not in func_cols:
            conn.execute(text(f"ALTER TABLE functions ADD COLUMN {col} JSON"))
    if 'product' not in func_cols:
        conn.execute(text("ALTER TABLE functions ADD COLUMN product TEXT"))

    dept_cols = {c['name'] for c in inspector.get_columns('departments')}
    for col in ('ai_employees', 'employees', 'regulations', 'instructions', 'frameworks'):
        if col not in dept_cols:
            conn.execute(text(f"ALTER TABLE departments ADD COLUMN {col} JSON"))


def _ensure_task_columns(conn):
    """Idempotently add local task columns that create_all cannot add to existing DBs."""
    from sqlalchemy import inspect, text

    inspector = inspect(conn)
    task_cols = {c['name'] for c in inspector.get_columns('user_tasks')}
    if 'preparation_notes' not in task_cols:
        conn.execute(text("ALTER TABLE user_tasks ADD COLUMN preparation_notes TEXT"))


def _ensure_subchat_columns(conn):
    """Idempotently add Telegram chat columns for existing local DBs."""
    from sqlalchemy import inspect, text

    inspector = inspect(conn)
    subchat_cols = {c['name'] for c in inspector.get_columns('user_subchats')}
    columns = {
        'title': "ALTER TABLE user_subchats ADD COLUMN title VARCHAR(255)",
        'source': "ALTER TABLE user_subchats ADD COLUMN source VARCHAR(40) DEFAULT 'app' NOT NULL",
        'telegram_chat_id': "ALTER TABLE user_subchats ADD COLUMN telegram_chat_id INTEGER",
        'telegram_user_id': "ALTER TABLE user_subchats ADD COLUMN telegram_user_id INTEGER",
        'telegram_username': "ALTER TABLE user_subchats ADD COLUMN telegram_username VARCHAR(255)",
        'telegram_full_name': "ALTER TABLE user_subchats ADD COLUMN telegram_full_name VARCHAR(255)",
    }
    for name, ddl in columns.items():
        if name not in subchat_cols:
            conn.execute(text(ddl))


def _ensure_knowledge_rag_columns(conn):
    """Idempotently add RAG metadata columns to existing knowledge tables.

    On Supabase/Postgres these were already added by the RAG phase-1 migration,
    so the inspector check skips them. On a local SQLite lab DB that was created
    earlier, this adds the plain columns (the Postgres-only tsvector/vector
    columns are not added here — RAG search runs on Postgres).
    """
    from sqlalchemy import inspect, text

    inspector = inspect(conn)
    is_sqlite = conn.dialect.name == 'sqlite'
    bool_default = '0' if is_sqlite else 'false'

    src_cols = {c['name'] for c in inspector.get_columns('knowledge_sources')}
    if 'confidential' not in src_cols:
        conn.execute(text(
            f"ALTER TABLE knowledge_sources ADD COLUMN confidential BOOLEAN NOT NULL DEFAULT {bool_default}"
        ))
    if 'methodology' not in src_cols:
        conn.execute(text("ALTER TABLE knowledge_sources ADD COLUMN methodology VARCHAR(80)"))

    frag_cols = {c['name'] for c in inspector.get_columns('knowledge_source_fragments')}
    for col in ('methodology', 'maturity_level', 'content_type', 'lang', 'source_version'):
        if col not in frag_cols:
            size = 20 if col == 'lang' else (40 if col in ('maturity_level', 'content_type') else 80)
            conn.execute(text(
                f"ALTER TABLE knowledge_source_fragments ADD COLUMN {col} VARCHAR({size})"
            ))
    if 'confidential' not in frag_cols:
        conn.execute(text(
            f"ALTER TABLE knowledge_source_fragments ADD COLUMN confidential BOOLEAN NOT NULL DEFAULT {bool_default}"
        ))


def _ensure_yandex_tracker_columns(conn):
    """Idempotently add Yandex Tracker columns to existing lab DBs."""
    from sqlalchemy import inspect, text

    inspector = inspect(conn)
    tables = set(inspector.get_table_names())
    if 'yandex_tracker_connections' not in tables:
        return

    cols = {c['name'] for c in inspector.get_columns('yandex_tracker_connections')}
    columns = {
        'org_id': "ALTER TABLE yandex_tracker_connections ADD COLUMN org_id VARCHAR(255)",
        'cloud_org_id': "ALTER TABLE yandex_tracker_connections ADD COLUMN cloud_org_id VARCHAR(255)",
        'token_type': (
            "ALTER TABLE yandex_tracker_connections "
            "ADD COLUMN token_type VARCHAR(20) DEFAULT 'oauth' NOT NULL"
        ),
        'tracker_user_id': "ALTER TABLE yandex_tracker_connections ADD COLUMN tracker_user_id VARCHAR(255)",
        'tracker_user_name': "ALTER TABLE yandex_tracker_connections ADD COLUMN tracker_user_name VARCHAR(255)",
        'tracker_email': "ALTER TABLE yandex_tracker_connections ADD COLUMN tracker_email VARCHAR(255)",
        'default_queue': "ALTER TABLE yandex_tracker_connections ADD COLUMN default_queue VARCHAR(100)",
    }
    for name, ddl in columns.items():
        if name not in cols:
            conn.execute(text(ddl))


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Инициализация БД и сидов — в защищённом блоке с таймаутом. Если БД на старте
    # недоступна или операция виснет (неверный DATABASE_URL, недоступная Supabase,
    # блокировка), веб-сервер ВСЁ РАВНО должен подняться и отвечать health-check, а
    # причина — попасть в лог. Иначе старт виснет молча, а оркестратор (Amvera)
    # бесконечно показывает «развёртывается».
    import asyncio
    import logging
    log = logging.getLogger("startup")

    async def _init_db() -> None:
        # Create tables on startup (dev only — prod uses Alembic)
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            await conn.run_sync(_ensure_client_columns)
            await conn.run_sync(_ensure_company_columns)
            await conn.run_sync(_ensure_task_columns)
            await conn.run_sync(_ensure_subchat_columns)
            await conn.run_sync(_ensure_knowledge_rag_columns)
            await conn.run_sync(_ensure_yandex_tracker_columns)
        # Сборщик осиротевших задач импорта. Фоновый конвейер «Добавить
        # методологию» живёт как in-process asyncio-задача и НЕ переживает
        # перезапуск процесса (деплой, OOM-кил и т.п.). Любая задача в статусе
        # running/queued на старте — заведомо мёртвая: помечаем её failed, иначе
        # она навсегда блокирует очередь импорта (queue-of-one) и в UI висит
        # «зависла».
        from sqlalchemy import text as _text
        async with AsyncSessionLocal() as db:
            res = await db.execute(_text(
                "UPDATE ingest_jobs SET status='failed', "
                "error=COALESCE(NULLIF(error, ''), '') || "
                "'[reaper] сервер перезапущен — задача прервана (возможно, не хватило памяти на extract)', "
                "updated_at=now() WHERE status IN ('running', 'queued')"
            ))
            await db.commit()
            if res.rowcount:
                log.warning("startup: reaper — осиротевших задач импорта помечено failed: %s", res.rowcount)
        await _seed_founder()
        async with AsyncSessionLocal() as db:
            await seed_if_empty(db)
            await seed_bpmm_source(db)
            await seed_bots(db)

    db_target = settings.database_url.split("@")[-1]
    # Диагностика окружения: видит ли процесс ключи Supabase Storage (значения не логируем).
    log.warning(
        "startup: Supabase Storage env — url=%s key=%s bucket=%s",
        bool(settings.supabase_url), bool(settings.supabase_service_key), settings.supabase_storage_bucket,
    )
    try:
        log.warning("startup: инициализация БД (target=%s)", db_target)
        await asyncio.wait_for(_init_db(), timeout=90)
        log.warning("startup: инициализация БД завершена успешно")
    except Exception:
        log.exception(
            "startup: инициализация БД ПРОВАЛЕНА/таймаут — сервер поднимется без сидов; "
            "проверьте DATABASE_URL и доступность БД"
        )
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


@app.middleware("http")
async def cache_headers(request, call_next):
    """Кэш-заголовки статики: ускоряет повторные загрузки приложения.

    Файлы в /assets/ имеют хэш содержимого в имени (index-XXXX.js) — браузеру
    можно кэшировать их год и никогда не перепроверять (immutable). index.html
    и прочее — no-cache: браузер перепроверяет, но получает 304, если не менялось.
    """
    response = await call_next(request)
    path = request.url.path
    if path.startswith("/assets/"):
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    elif not path.startswith("/api/"):
        response.headers.setdefault("Cache-Control", "no-cache")
    return response


@app.get("/api/health")
async def health():
    return {"status": "ok"}


# Register routers
app.include_router(auth.router, prefix="/api", tags=["auth"])
app.include_router(clients.router, prefix="/api/clients", tags=["clients"])
app.include_router(portal_users.router, prefix="/api/clients", tags=["portal-users"])
app.include_router(portal.router, prefix="/api/portal", tags=["portal"])
app.include_router(briefs.router, prefix="/api/briefs", tags=["briefs"])
app.include_router(company.router, prefix="/api/company", tags=["company"])
app.include_router(tasks.router, prefix="/api/tasks", tags=["tasks"])
app.include_router(agent.router, prefix="/api/agent", tags=["agent"])
app.include_router(chat.router, prefix="/api/chat", tags=["chat"])
app.include_router(knowledge.router, prefix="/api/knowledge", tags=["knowledge"])
app.include_router(sources.router, prefix="/api/knowledge", tags=["sources"])
app.include_router(goals.router, prefix="/api/goals", tags=["goals"])
app.include_router(projects.router, prefix="/api/projects", tags=["projects"])
app.include_router(secretary.router, prefix="/api/secretary", tags=["secretary"])
app.include_router(bots.router, prefix="/api/bots", tags=["bots"])
app.include_router(tracker.router, prefix="/api/tracker", tags=["tracker"])


# ── Раздача собранного фронтенда (SPA) ──
# Должно идти ПОСЛЕ API-роутов, чтобы не перехватывать /api/*.
if os.path.isdir(_DIST):
    app.mount("/assets", StaticFiles(directory=os.path.join(_DIST, "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # /api/* сюда попадать не должен, но на всякий случай отдаём 404
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found")
        # Клиентский портал — ОТДЕЛЬНЫЙ бандл (portal.html). Любой путь /portal*
        # без собственного файла отдаём в portal.html, чтобы он не подменялся
        # основным приложением (index.html).
        portal_index = os.path.join(_DIST, "portal.html")
        if (full_path == "portal" or full_path.startswith("portal/")) and os.path.isfile(portal_index):
            return FileResponse(portal_index)
        # Защита от path traversal: нормализуем путь и отдаём файл только если
        # он реально лежит внутри dist; всё остальное (вкл. /../...) — SPA fallback.
        candidate = os.path.normpath(os.path.join(_DIST, full_path))
        if full_path and candidate.startswith(_DIST + os.sep) and os.path.isfile(candidate):
            return FileResponse(candidate)
        # SPA fallback: любой неизвестный путь → index.html (клиентский роутинг)
        return FileResponse(os.path.join(_DIST, "index.html"))
