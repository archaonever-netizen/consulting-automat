from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..core.database import get_db
from ..models import UserChatSession, UserSubChat
from ..routes._ratelimit import rate_limit
from ..routes.auth import get_current_user_dep
from ..schemas.chat import (
    ChatMessageRead,
    ChatSessionRead,
    SendMessageRequest,
    SubChatCreate,
    SubChatRead,
    TelegramChatCreate,
)
from ..services import chat_service

router = APIRouter()


@router.get("/session", response_model=ChatSessionRead)
async def get_session(
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    """Получить или создать сессию чата текущего пользователя."""
    session = await chat_service.get_or_create_session(db, current_user)
    # перезагрузить с subchats И их messages — иначе сериализация SubChatRead.messages
    # триггерит ленивую загрузку вне greenlet (MissingGreenlet → 500).
    result = await db.execute(
        select(UserChatSession)
        .where(UserChatSession.id == session.id)
        .options(
            selectinload(UserChatSession.subchats).selectinload(UserSubChat.messages)
        )
    )
    return result.scalar_one()


@router.post("/session/subchats", response_model=SubChatRead)
async def create_subchat(
    data: SubChatCreate,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    """Создать новый подчат в сессии пользователя."""
    session = await chat_service.get_or_create_session(db, current_user)
    subchat = await chat_service.create_subchat(db, session.id, data.task_id)
    # перезагрузить с messages — иначе сериализация SubChatRead.messages
    # триггерит ленивую загрузку вне greenlet (MissingGreenlet → 500).
    result = await db.execute(
        select(UserSubChat)
        .where(UserSubChat.id == subchat.id)
        .options(selectinload(UserSubChat.messages))
    )
    return result.scalar_one()


@router.post("/session/telegram-chats", response_model=SubChatRead)
async def create_telegram_chat(
    data: TelegramChatCreate,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    """Create or update a Telegram-origin chat in the user's AI chat session."""
    session = await chat_service.get_or_create_session(db, current_user)
    subchat = await chat_service.create_or_update_telegram_subchat(
        db,
        session.id,
        telegram_chat_id=data.telegram_chat_id,
        telegram_user_id=data.telegram_user_id,
        telegram_username=data.telegram_username,
        telegram_full_name=data.telegram_full_name,
    )
    result = await db.execute(
        select(UserSubChat)
        .where(UserSubChat.id == subchat.id)
        .options(selectinload(UserSubChat.messages))
    )
    return result.scalar_one()


@router.delete("/subchats/{subchat_id}", status_code=204)
async def delete_subchat(
    subchat_id: int,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    """Удалить подчат задачи. Основной чат удалять нельзя."""
    res = await chat_service.delete_subchat(db, subchat_id)
    if res == 'notfound':
        raise HTTPException(status_code=404, detail="Subchat not found")
    if res == 'main':
        raise HTTPException(status_code=400, detail="Основной чат удалить нельзя")


@router.get("/subchats/{subchat_id}", response_model=SubChatRead)
async def get_subchat(
    subchat_id: int,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    """Получить подчат с сообщениями."""
    result = await db.execute(
        select(UserSubChat)
        .where(UserSubChat.id == subchat_id)
        .options(selectinload(UserSubChat.messages))
    )
    subchat = result.scalar_one_or_none()
    if not subchat:
        raise HTTPException(status_code=404, detail="Subchat not found")
    return subchat


@router.get("/subchats/{subchat_id}/messages", response_model=list[ChatMessageRead])
async def get_messages(
    subchat_id: int,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    """Получить все сообщения в подчате."""
    messages = await chat_service.get_subchat_messages(db, subchat_id)
    return messages


@router.post("/subchats/{subchat_id}/send", dependencies=[Depends(rate_limit("chat", 20))])
async def send_message(
    subchat_id: int,
    req: SendMessageRequest,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    """
    Отправить сообщение и получить ответ ИИ через SSE streaming.
    Content-Type: text/event-stream
    Каждое событие: data: {"chunk": "текст"}\n\n
    Завершение: data: {"done": true}\n\n
    """
    return StreamingResponse(
        chat_service.stream_response(db, subchat_id, req.content),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
