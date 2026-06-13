from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import get_settings
from ..core.database import get_db
from ..routes.auth import get_current_user_dep
from ..schemas.secretary import LocalSecretaryMessage, SecretaryResponse, TelegramSendMessage
from ..services import chat_service
from ..services.secretary_core import handle_secretary_message, resolve_secretary_user
from ..services.telegram_secretary import handle_telegram_update, send_telegram_message

router = APIRouter()


def _resolve_telegram_chat_id(chat_id: int | None = None) -> int:
    settings = get_settings()
    if chat_id is not None:
        return chat_id
    if settings.secretary_owner_telegram_id:
        try:
            return int(settings.secretary_owner_telegram_id)
        except ValueError as exc:
            raise HTTPException(
                status_code=400,
                detail="SECRETARY_OWNER_TELEGRAM_ID must be an integer",
            ) from exc
    raise HTTPException(status_code=400, detail="Telegram chat_id is required")


@router.post("/local/message", response_model=SecretaryResponse)
async def local_message(
    data: LocalSecretaryMessage,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    user = current_user
    if data.user_email:
        user = await resolve_secretary_user(db, data.user_email)
    if user is None:
        raise HTTPException(status_code=404, detail="Secretary user not found")
    response = await handle_secretary_message(db, data.text, user)
    if response.action.type == "send_telegram" and response.action.message_text:
        settings = get_settings()
        if not settings.telegram_bot_token:
            raise HTTPException(status_code=400, detail="TELEGRAM_BOT_TOKEN is not configured")
        await send_telegram_message(
            _resolve_telegram_chat_id(),
            response.action.message_text,
        )
        response.text = "Отправил сообщение в Telegram."
    if response.action.type == "create_chat" and response.action.telegram_chat_id is not None:
        session = await chat_service.get_or_create_session(db, user)
        subchat = await chat_service.create_or_update_telegram_subchat(
            db,
            session.id,
            telegram_chat_id=response.action.telegram_chat_id,
            telegram_user_id=response.action.telegram_user_id,
            telegram_username=response.action.telegram_username,
            telegram_full_name=response.action.telegram_full_name,
        )
        response.action.subchat_id = subchat.id
        response.action.title = subchat.title
        response.text = f"Создал Telegram-чат: {subchat.title}."
    return response


@router.post("/telegram/send")
async def telegram_send(
    data: TelegramSendMessage,
    current_user=Depends(get_current_user_dep),
):
    settings = get_settings()
    if not settings.telegram_bot_token:
        raise HTTPException(status_code=400, detail="TELEGRAM_BOT_TOKEN is not configured")

    chat_id = _resolve_telegram_chat_id(data.chat_id)

    await send_telegram_message(chat_id, data.text)
    return {"ok": True, "chat_id": chat_id, "sent_by_user_id": current_user.id}


@router.post("/telegram/webhook")
async def telegram_webhook(
    request: Request,
    x_telegram_bot_api_secret_token: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    settings = get_settings()
    if settings.telegram_webhook_secret:
        if x_telegram_bot_api_secret_token != settings.telegram_webhook_secret:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Invalid webhook secret",
            )

    update = await request.json()
    return await handle_telegram_update(db, update)
