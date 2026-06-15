"""Сервис раздела «ИИ-Сотрудники».

Этап 0: первичный сид. Переносит захардкоженный системный промпт Методолога
в строку БД и заводит фреймворк BPMM как группу источников знаний. Дальше
(Этап 1+) сюда же лягут CRUD-операции над ботами, фреймворками и привязками.

Сид идемпотентен и создаёт сущности ТОЛЬКО если их ещё нет: после первого
запуска БД — источник истины для промптов/конфига, и правки из UI не
затираются при рестарте.
"""
from __future__ import annotations

import time
from datetime import date, datetime, timedelta

from jose import JWTError, jwt
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..core.config import get_settings
from ..models import (
    Bot, BotDepartment, BotFramework, BotTokenUsage, Department, EditLock,
    Framework, FrameworkSource, KnowledgeSource,
)
from .methodolog import METHODOLOG_MODEL, SYSTEM_PROMPT, ask_methodolog

# Короткая стоячая инструкция, которая добавляется к КАЖДОМУ запросу бота
# (Этап 2). В отличие от системного промпта, не теряется в длинных диалогах.
_METHODOLOG_PERSISTENT_PROMPT = (
    "Отвечай по-русски и опирайся ТОЛЬКО на найденные выдержки. "
    "Не выдумывай источники, страницы и разделы."
)


async def _ensure_framework(
    db: AsyncSession, *, key: str, name: str, description: str, source_keys: list[str]
) -> Framework:
    """Создать фреймворк (если нет) и привязать к нему источники знаний по ключам."""
    framework = await db.scalar(select(Framework).where(Framework.key == key))
    if framework is None:
        framework = Framework(key=key, name=name, description=description)
        db.add(framework)
        await db.flush()

    existing_source_ids = {
        link.source_id for link in (await db.scalars(
            select(FrameworkSource).where(FrameworkSource.framework_id == framework.id)
        )).all()
    }
    for source_key in source_keys:
        source = await db.scalar(select(KnowledgeSource).where(KnowledgeSource.key == source_key))
        if source is not None and source.id not in existing_source_ids:
            db.add(FrameworkSource(framework_id=framework.id, source_id=source.id))
    return framework


async def seed_bots(db: AsyncSession) -> None:
    """Завести фреймворк BPMM и первого бота — Методолога — если их ещё нет."""
    bpmm = await _ensure_framework(
        db,
        key="bpmm",
        name="BPMM",
        description="Business Process Maturity Model — зрелость бизнес-процессов.",
        source_keys=["bpmm"],
    )

    bot = await db.scalar(select(Bot).where(Bot.key == "methodolog"))
    if bot is None:
        bot = Bot(
            key="methodolog",
            name="Методолог",
            description=(
                "Строгий, доброжелательный консультант по методологиям управления "
                "бизнес-процессами и их зрелости. Разбирает рассуждение, находит риск, "
                "подтверждает методикой и ссылается на источник."
            ),
            system_prompt=SYSTEM_PROMPT,
            persistent_prompt=_METHODOLOG_PERSISTENT_PROMPT,
            model=METHODOLOG_MODEL,
            agent_impl="methodolog",
        )
        db.add(bot)
        await db.flush()
        db.add(BotFramework(bot_id=bot.id, framework_id=bpmm.id))

    await db.commit()


# ─────────────────────────── Каталог моделей ────────────────────────────────
# Выверенный снимок реального каталога провайдера (Promptra /v1/models) на момент
# Этапа 1 — фолбэк на случай, если live-выгрузка недоступна. В норме список
# тянется живьём из /v1/models, поэтому любой выбранный id гарантированно рабочий.
_VERIFIED_MODELS: list[str] = [
    "anthropic/claude-opus-4.8",
    "anthropic/claude-opus-4.7",
    "anthropic/claude-opus-4.6",
    "anthropic/claude-sonnet-4.6",
    "openai/gpt-5.5",
    "openai/gpt-5.4",
    "openai/gpt-5.4-mini",
    "openai/gpt-5.4-nano",
    "openai/gpt-5.2",
    "openai/gpt-5.2-pro",
    "google/gemini-3.5-flash",
    "google/gemini-3.1-pro-preview",
    "google/gemini-3.1-flash-lite",
    "google/gemini-3-flash-preview",
    "deepseek/deepseek-v4-pro",
    "deepseek/deepseek-v4-flash",
    "x-ai/grok-4.3",
    "x-ai/grok-4.1-fast",
    "qwen/qwen3.7-max",
    "moonshotai/kimi-k2.6",
    "minimax/minimax-m3",
    "z-ai/glm-5.1",
]

_MODELS_TTL = 600  # сек: кэш live-каталога, чтобы не дёргать провайдера на каждый запрос
_models_cache: dict = {"ts": 0.0, "ids": None}


def list_models() -> list[str]:
    """Реальные id моделей провайдера. Live из /v1/models с кэшем; фолбэк — снимок.

    Синхронный (сетевой) вызов — оборачивать в asyncio.to_thread на стороне роута.
    """
    now = time.time()
    cached = _models_cache.get("ids")
    if cached and now - _models_cache["ts"] < _MODELS_TTL:
        return cached
    ids: list[str] | None = None
    try:
        from openai import OpenAI
        settings = get_settings()
        if settings.promptra_api_key:
            client = OpenAI(
                api_key=settings.promptra_api_key,
                base_url=settings.promptra_base_url,
                timeout=15,
            )
            ids = sorted(m.id for m in client.models.list().data)
    except Exception:  # noqa: BLE001 — любой сбой = тихий фолбэк на выверенный список
        ids = None
    if not ids:
        ids = list(_VERIFIED_MODELS)
    _models_cache.update(ts=now, ids=ids)
    return ids


# ─────────────────────────── Пароль-замок ───────────────────────────────────
# Замок — дополнительный гейт на РЕДАКТИРОВАНИЕ поверх доступа основателя (не
# замена контроля доступа). Хэш пароля — в одной строке edit_lock (id=1).
# Успешная проверка выдаёт короткоживущий «unlock»-токен (JWT, scope=bot_edit),
# который требуют редактирующие эндпоинты.
_UNLOCK_SCOPE = "bot_edit"
_UNLOCK_TTL_MIN = 20


async def _get_lock_row(db: AsyncSession) -> EditLock:
    lock = await db.get(EditLock, 1)
    if lock is None:
        lock = EditLock(id=1)
        db.add(lock)
        await db.flush()
    return lock


async def is_lock_set(db: AsyncSession) -> bool:
    lock = await db.get(EditLock, 1)
    return bool(lock and lock.password_hash)


async def set_lock_password(db: AsyncSession, new_password: str, current_password: str | None) -> None:
    """Задать/сменить пароль-замок. Если пароль уже задан — нужен текущий."""
    new_password = (new_password or "").strip()
    if len(new_password) < 4:
        raise ValueError("Пароль слишком короткий (минимум 4 символа).")
    lock = await _get_lock_row(db)
    if lock.password_hash:
        if not lock.check_password((current_password or "").strip()):
            raise ValueError("Неверный текущий пароль-замок.")
    lock.set_password(new_password)
    await db.commit()


async def verify_lock_password(db: AsyncSession, password: str) -> bool:
    lock = await db.get(EditLock, 1)
    return bool(lock and lock.check_password((password or "").strip()))


def create_unlock_token() -> str:
    settings = get_settings()
    payload = {
        "scope": _UNLOCK_SCOPE,
        "exp": datetime.utcnow() + timedelta(minutes=_UNLOCK_TTL_MIN),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def verify_unlock_token(token: str) -> bool:
    if not token:
        return False
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except JWTError:
        return False
    return payload.get("scope") == _UNLOCK_SCOPE


# ─────────────────────────── CRUD ботов ─────────────────────────────────────
def _bot_list_item(bot: Bot) -> dict:
    return {
        "id": bot.id,
        "key": bot.key,
        "name": bot.name,
        "description": bot.description,
        "model": bot.model,
        "agent_impl": bot.agent_impl,
        "is_active": bot.is_active,
    }


def _bot_detail(bot: Bot) -> dict:
    return {
        **_bot_list_item(bot),
        "system_prompt": bot.system_prompt,
        "persistent_prompt": bot.persistent_prompt,
        "frameworks": [
            {"id": l.framework.id, "key": l.framework.key, "name": l.framework.name}
            for l in bot.framework_links
        ],
        "departments": [
            {"id": l.department.id, "name": l.department.name}
            for l in bot.department_links
        ],
    }


async def list_bots(db: AsyncSession) -> list[dict]:
    rows = (await db.scalars(select(Bot).order_by(Bot.id))).all()
    return [_bot_list_item(b) for b in rows]


async def get_bot(db: AsyncSession, bot_id: int) -> dict | None:
    bot = await db.scalar(
        select(Bot)
        .where(Bot.id == bot_id)
        .options(
            selectinload(Bot.framework_links).selectinload(BotFramework.framework),
            selectinload(Bot.department_links).selectinload(BotDepartment.department),
        )
    )
    return _bot_detail(bot) if bot else None


_EDITABLE_FIELDS = {"name", "description", "system_prompt", "persistent_prompt", "model", "is_active"}


async def update_bot(db: AsyncSession, bot_id: int, fields: dict) -> dict | None:
    bot = await db.get(Bot, bot_id)
    if bot is None:
        return None
    if "model" in fields and fields["model"] is not None:
        if fields["model"] not in list_models():
            raise ValueError(f"Неизвестная модель: {fields['model']}")
    for key, value in fields.items():
        if key in _EDITABLE_FIELDS:
            setattr(bot, key, value)
    await db.commit()
    return await get_bot(db, bot_id)


async def set_bot_frameworks(db: AsyncSession, bot_id: int, framework_ids: list[int]) -> dict | None:
    bot = await db.get(Bot, bot_id)
    if bot is None:
        return None
    wanted = set(framework_ids)
    # валидируем, что все фреймворки существуют
    if wanted:
        found = set((await db.scalars(select(Framework.id).where(Framework.id.in_(wanted)))).all())
        missing = wanted - found
        if missing:
            raise ValueError(f"Фреймворки не найдены: {sorted(missing)}")
    current = (await db.scalars(select(BotFramework).where(BotFramework.bot_id == bot_id))).all()
    current_ids = {l.framework_id for l in current}
    for link in current:
        if link.framework_id not in wanted:
            await db.delete(link)
    for fid in wanted - current_ids:
        db.add(BotFramework(bot_id=bot_id, framework_id=fid))
    await db.commit()
    return await get_bot(db, bot_id)


async def set_bot_departments(db: AsyncSession, bot_id: int, department_ids: list[int]) -> dict | None:
    bot = await db.get(Bot, bot_id)
    if bot is None:
        return None
    wanted = set(department_ids)
    if wanted:
        found = set((await db.scalars(select(Department.id).where(Department.id.in_(wanted)))).all())
        missing = wanted - found
        if missing:
            raise ValueError(f"Отделы не найдены: {sorted(missing)}")
    current = (await db.scalars(select(BotDepartment).where(BotDepartment.bot_id == bot_id))).all()
    current_ids = {l.department_id for l in current}
    for link in current:
        if link.department_id not in wanted:
            await db.delete(link)
    for did in wanted - current_ids:
        db.add(BotDepartment(bot_id=bot_id, department_id=did))
    await db.commit()
    return await get_bot(db, bot_id)


async def list_frameworks(db: AsyncSession) -> list[dict]:
    rows = (await db.scalars(
        select(Framework).options(selectinload(Framework.source_links)).order_by(Framework.name)
    )).all()
    return [
        {"id": f.id, "key": f.key, "name": f.name, "description": f.description,
         "source_count": len(f.source_links)}
        for f in rows
    ]


async def list_departments(db: AsyncSession) -> list[dict]:
    rows = (await db.scalars(select(Department).order_by(Department.name))).all()
    return [{"id": d.id, "name": d.name} for d in rows]


# ─────────────────────────── Чат с ботом + токены ───────────────────────────
async def _bot_source_keys(db: AsyncSession, bot_id: int) -> list[str]:
    """Ключи источников знаний из всех фреймворков бота (фильтр поиска RAG)."""
    rows = (await db.scalars(
        select(KnowledgeSource.key)
        .join(FrameworkSource, FrameworkSource.source_id == KnowledgeSource.id)
        .join(BotFramework, BotFramework.framework_id == FrameworkSource.framework_id)
        .where(BotFramework.bot_id == bot_id)
        .distinct()
    )).all()
    return list(rows)


async def _log_tokens(db: AsyncSession, bot_id: int, usage: dict, source: str) -> None:
    db.add(BotTokenUsage(
        bot_id=bot_id,
        usage_date=date.today(),
        prompt_tokens=int(usage.get("prompt_tokens", 0) or 0),
        completion_tokens=int(usage.get("completion_tokens", 0) or 0),
        total_tokens=int(usage.get("total_tokens", 0) or 0),
        source=source,
    ))
    await db.commit()


async def run_bot_chat(db: AsyncSession, bot_id: int, message: str, *, source: str = "test") -> dict | None:
    """Запустить бота с его конфигом из БД и залогировать расход токенов под bot_id.

    Сейчас поддержан движок 'methodolog'. Конфиг (оба промпта, модель, фреймворки→
    источники) берётся из БД, поэтому разные боты ведут себя по-разному.
    Расход токенов (в т.ч. из проверочных тестов) пишется в счётчик бота.
    """
    bot = await db.get(Bot, bot_id)
    if bot is None:
        return None

    source_keys = await _bot_source_keys(db, bot_id)

    if bot.agent_impl == "methodolog":
        result = await ask_methodolog(
            message,
            model=bot.model or METHODOLOG_MODEL,
            system_prompt=bot.system_prompt,
            persistent_prompt=bot.persistent_prompt,
            source_keys=source_keys or None,
        )
    else:
        raise ValueError(f"Движок бота не поддержан: {bot.agent_impl}")

    usage = result.get("usage") or {}
    await _log_tokens(db, bot_id, usage, source)

    # Лёгкая выжимка источников для UI (без полного текста выдержек).
    evidence = [
        {
            "source_key": h.source_key,
            "page_start": h.page_start,
            "page_end": h.page_end,
            "section": h.section,
        }
        for h in (result.get("evidence") or [])
    ]
    return {"answer": result.get("answer", ""), "usage": usage, "evidence": evidence}


# ─────────────────────────── Счётчики токенов ───────────────────────────────
def _period_range(period: str, date_from: date | None, date_to: date | None) -> tuple[date, date]:
    """Границы периода (включительно). today / week (7д) / month (30д) / custom."""
    today = date.today()
    if period == "today":
        return today, today
    if period == "week":
        return today - timedelta(days=6), today
    if period == "month":
        return today - timedelta(days=29), today
    if period == "custom":
        return (date_from or today), (date_to or today)
    raise ValueError(f"Неизвестный период: {period}")


async def bot_usage(
    db: AsyncSession,
    bot_id: int,
    *,
    period: str = "today",
    date_from: date | None = None,
    date_to: date | None = None,
) -> dict:
    """Сумма расхода токенов бота за период (для счётчика в карточке)."""
    start, end = _period_range(period, date_from, date_to)
    row = (await db.execute(
        select(
            func.coalesce(func.sum(BotTokenUsage.prompt_tokens), 0),
            func.coalesce(func.sum(BotTokenUsage.completion_tokens), 0),
            func.coalesce(func.sum(BotTokenUsage.total_tokens), 0),
        ).where(
            BotTokenUsage.bot_id == bot_id,
            BotTokenUsage.usage_date >= start,
            BotTokenUsage.usage_date <= end,
        )
    )).one()
    return {
        "period": period,
        "date_from": start.isoformat(),
        "date_to": end.isoformat(),
        "prompt_tokens": int(row[0]),
        "completion_tokens": int(row[1]),
        "total_tokens": int(row[2]),
    }
