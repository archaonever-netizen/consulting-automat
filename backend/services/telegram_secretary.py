from __future__ import annotations

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import get_settings
from .secretary_core import handle_secretary_message, resolve_secretary_user


def extract_telegram_message(update: dict) -> tuple[int, int, str] | None:
    message = update.get("message") or update.get("edited_message")
    if not isinstance(message, dict):
        return None
    text = message.get("text")
    chat = message.get("chat") or {}
    sender = message.get("from") or {}
    chat_id = chat.get("id")
    user_id = sender.get("id")
    if not isinstance(text, str) or chat_id is None or user_id is None:
        return None
    return int(chat_id), int(user_id), text


async def handle_telegram_update(db: AsyncSession, update: dict) -> dict:
    parsed = extract_telegram_message(update)
    if parsed is None:
        return {"ok": True, "ignored": True}

    chat_id, telegram_user_id, text = parsed
    settings = get_settings()
    if settings.secretary_owner_telegram_id:
        allowed = settings.secretary_owner_telegram_id.strip()
        if str(telegram_user_id) != allowed:
            reply = "Этот секретарь привязан к другому пользователю."
            await send_telegram_message(chat_id, reply)
            return {"ok": False, "error": "unauthorized_telegram_user"}

    user = await resolve_secretary_user(db)
    if user is None:
        reply = "Не нашёл локального пользователя для секретаря."
        await send_telegram_message(chat_id, reply)
        return {"ok": False, "error": "local_user_not_found"}

    response = await handle_secretary_message(db, text, user)
    await send_telegram_message(chat_id, response.text)
    return {"ok": True, "reply": response.text, "action": response.action.model_dump()}


async def send_telegram_message(chat_id: int, text: str) -> None:
    settings = get_settings()
    if not settings.telegram_bot_token:
        return

    url = f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage"
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.post(url, json={"chat_id": chat_id, "text": text})
        response.raise_for_status()
