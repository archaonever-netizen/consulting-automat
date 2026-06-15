"""API раздела «ИИ-Сотрудники».

Весь раздел — ТОЛЬКО для основателя (и чтение, и запись). Поверх этого на
редактирование промптов/настроек висит пароль-замок: редактирующие эндпоинты
дополнительно требуют короткоживущий unlock-токен (заголовок X-Edit-Unlock),
который выдаёт POST /lock/verify по правильному паролю.
"""
import asyncio

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.database import get_db
from ..routes.auth import get_current_user_dep
from datetime import date

from ..schemas.bots import (
    BotUpdate, BotFrameworksSet, BotDepartmentsSet, BotChatRequest,
    LockSetRequest, LockVerifyRequest,
)
from ..services import bots as svc

router = APIRouter()


async def require_founder(current_user=Depends(get_current_user_dep)):
    """Раздел «ИИ-Сотрудники» доступен только основателю."""
    if not current_user.is_founder:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Раздел «ИИ-Сотрудники» доступен только основателю",
        )
    return current_user


async def require_edit_unlock(x_edit_unlock: str = Header(default="")):
    """Гейт на редактирование: нужен действующий unlock-токен пароля-замка."""
    if not svc.verify_unlock_token(x_edit_unlock):
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail="Редактирование заблокировано. Введите пароль-замок.",
        )
    return True


# ─────────────────────────── Справочники ────────────────────────────────────
@router.get("/models")
async def get_models(_=Depends(require_founder)):
    """Реальные id моделей провайдера (live из /v1/models, фолбэк — снимок)."""
    return {"models": await asyncio.to_thread(svc.list_models)}


@router.get("/frameworks")
async def get_frameworks(_=Depends(require_founder), db: AsyncSession = Depends(get_db)):
    return await svc.list_frameworks(db)


@router.get("/departments")
async def get_departments(_=Depends(require_founder), db: AsyncSession = Depends(get_db)):
    return await svc.list_departments(db)


# ─────────────────────────── Пароль-замок ───────────────────────────────────
@router.get("/lock")
async def get_lock_status(_=Depends(require_founder), db: AsyncSession = Depends(get_db)):
    """Задан ли пароль-замок."""
    return {"is_set": await svc.is_lock_set(db)}


@router.post("/lock")
async def set_lock(
    data: LockSetRequest,
    _=Depends(require_founder),
    db: AsyncSession = Depends(get_db),
):
    """Задать/сменить пароль-замок (при смене нужен текущий пароль)."""
    try:
        await svc.set_lock_password(db, data.new_password, data.current_password)
    except ValueError as exc:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(exc))
    return {"is_set": True}


@router.post("/lock/verify")
async def verify_lock(
    data: LockVerifyRequest,
    _=Depends(require_founder),
    db: AsyncSession = Depends(get_db),
):
    """Проверить пароль-замок и выдать unlock-токен для редактирования."""
    if not await svc.is_lock_set(db):
        raise HTTPException(status_code=409, detail="Пароль-замок ещё не задан.")
    if not await svc.verify_lock_password(db, data.password):
        raise HTTPException(status_code=401, detail="Неверный пароль-замок.")
    return {"unlock_token": svc.create_unlock_token()}


# ─────────────────────────── Боты ───────────────────────────────────────────
@router.get("")
async def get_bots(_=Depends(require_founder), db: AsyncSession = Depends(get_db)):
    """Список карточек ботов (название + описание + модель)."""
    return await svc.list_bots(db)


@router.get("/{bot_id}")
async def get_bot(
    bot_id: int,
    _=Depends(require_founder),
    db: AsyncSession = Depends(get_db),
):
    bot = await svc.get_bot(db, bot_id)
    if bot is None:
        raise HTTPException(status_code=404, detail="Бот не найден")
    return bot


@router.patch("/{bot_id}")
async def patch_bot(
    bot_id: int,
    data: BotUpdate,
    _=Depends(require_founder),
    __=Depends(require_edit_unlock),
    db: AsyncSession = Depends(get_db),
):
    """Обновить имя/описание/промпты/модель. Требует unlock-токен."""
    try:
        bot = await svc.update_bot(db, bot_id, data.model_dump(exclude_unset=True))
    except ValueError as exc:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(exc))
    if bot is None:
        raise HTTPException(status_code=404, detail="Бот не найден")
    return bot


@router.put("/{bot_id}/frameworks")
async def put_bot_frameworks(
    bot_id: int,
    data: BotFrameworksSet,
    _=Depends(require_founder),
    __=Depends(require_edit_unlock),
    db: AsyncSession = Depends(get_db),
):
    """Заменить набор фреймворков бота. Требует unlock-токен."""
    try:
        bot = await svc.set_bot_frameworks(db, bot_id, data.framework_ids)
    except ValueError as exc:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(exc))
    if bot is None:
        raise HTTPException(status_code=404, detail="Бот не найден")
    return bot


@router.put("/{bot_id}/departments")
async def put_bot_departments(
    bot_id: int,
    data: BotDepartmentsSet,
    _=Depends(require_founder),
    __=Depends(require_edit_unlock),
    db: AsyncSession = Depends(get_db),
):
    """Заменить набор отделов бота. Требует unlock-токен."""
    try:
        bot = await svc.set_bot_departments(db, bot_id, data.department_ids)
    except ValueError as exc:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(exc))
    if bot is None:
        raise HTTPException(status_code=404, detail="Бот не найден")
    return bot


# ─────────────────────────── Чат + счётчики ─────────────────────────────────
@router.post("/{bot_id}/chat")
async def chat_with_bot(
    bot_id: int,
    data: BotChatRequest,
    _=Depends(require_founder),
    db: AsyncSession = Depends(get_db),
):
    """Проверочный чат с ботом (его текущий конфиг). Токены идут в счётчик."""
    message = (data.message or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="Пустое сообщение")
    try:
        result = await svc.run_bot_chat(db, bot_id, message, source="test")
    except RuntimeError as exc:
        # Гибридный поиск требует Postgres/pgvector (локальная SQLite его не видит).
        raise HTTPException(status_code=503, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if result is None:
        raise HTTPException(status_code=404, detail="Бот не найден")
    return result


@router.get("/{bot_id}/usage")
async def get_bot_usage(
    bot_id: int,
    period: str = "today",
    date_from: date | None = None,
    date_to: date | None = None,
    _=Depends(require_founder),
    db: AsyncSession = Depends(get_db),
):
    """Счётчик токенов бота: today / week / month / custom (date_from, date_to)."""
    if await svc.get_bot(db, bot_id) is None:
        raise HTTPException(status_code=404, detail="Бот не найден")
    try:
        return await svc.bot_usage(db, bot_id, period=period, date_from=date_from, date_to=date_to)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
