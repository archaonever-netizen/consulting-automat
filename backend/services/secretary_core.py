from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import get_settings
from ..models import Client, User, UserTask
from ..schemas.secretary import SecretaryAction, SecretaryResponse, SecretaryTaskCard

PERSONAL_CLIENT_NAME = "Личный секретарь"


@dataclass(frozen=True)
class ParsedIntent:
    name: str
    title: str | None = None
    duration_minutes: int | None = None
    message_text: str | None = None
    telegram_chat_id: int | None = None
    telegram_user_id: int | None = None
    telegram_username: str | None = None
    telegram_full_name: str | None = None


HELP_TEXT = (
    "Я локальный Telegram-секретарь. Пока умею базовые команды:\n"
    "- `задача: ...` или `добавь задачу ...` - создать задачу\n"
    "- `напомни ...` - создать задачу-напоминание\n"
    "- `задачи` или `список` - показать ближайшие открытые задачи\n"
    "- `отправь сообщение ...` - отправить текст в Telegram\n"
    "\n"
    "Пример: `добавь задачу подготовить КП для клиента на 45 минут`."
)


def parse_secretary_intent(text: str) -> ParsedIntent:
    normalized = " ".join(text.strip().split())
    lowered = normalized.lower()

    if not normalized or lowered in {"/start", "/help", "help", "помощь"}:
        return ParsedIntent("help")

    if lowered in {"задачи", "список", "что у меня", "что делать"}:
        return ParsedIntent("list_tasks")

    send_prefixes = (
        "отправь сообщение",
        "отправить сообщение",
        "сообщение в telegram:",
        "сообщение в телеграм:",
        "напиши в telegram",
        "напиши в телеграм",
    )
    for prefix in send_prefixes:
        if lowered.startswith(prefix):
            message_text = normalized[len(prefix):].strip(" :-")
            if message_text:
                return ParsedIntent("send_telegram", message_text=message_text)

    create_chat_prefixes = (
        "создать чат",
        "создай чат",
        "создать telegram чат",
        "создай telegram чат",
        "создать телеграм чат",
        "создай телеграм чат",
    )
    for prefix in create_chat_prefixes:
        if lowered.startswith(prefix):
            parsed_chat = _parse_create_chat_payload(normalized[len(prefix):].strip(" :-"))
            if parsed_chat is not None:
                return parsed_chat

    create_prefixes = (
        "задача:",
        "задача ",
        "добавь задачу",
        "создай задачу",
        "напомни",
    )
    for prefix in create_prefixes:
        if lowered.startswith(prefix):
            title = normalized[len(prefix):].strip(" :-")
            duration = _extract_duration_minutes(title)
            title = _strip_duration(title).strip(" ,.")
            if title:
                return ParsedIntent("create_task", title=title, duration_minutes=duration)

    return ParsedIntent("unknown")


def _parse_create_chat_payload(payload: str) -> ParsedIntent | None:
    id_match = re.search(r"-?\d{4,}", payload)
    if not id_match:
        return None

    telegram_chat_id = int(id_match.group(0))
    username_match = re.search(r"@([A-Za-z0-9_]{3,32})", payload)
    telegram_username = username_match.group(1) if username_match else None
    full_name = (payload[: id_match.start()] + payload[id_match.end() :]).strip(" :-,")
    if username_match:
        full_name = full_name.replace(username_match.group(0), "").strip(" :-,")

    return ParsedIntent(
        "create_chat",
        telegram_chat_id=telegram_chat_id,
        telegram_user_id=telegram_chat_id,
        telegram_username=telegram_username,
        telegram_full_name=full_name or None,
    )


def _extract_duration_minutes(text: str) -> int | None:
    match = re.search(r"\bна\s+(\d{1,3})\s*(минут[уы]?|мин|час[а-я]*)\b", text, flags=re.IGNORECASE)
    if not match:
        return None
    value = int(match.group(1))
    unit = match.group(2).lower()
    return value * 60 if unit.startswith("час") else value


def _strip_duration(text: str) -> str:
    return re.sub(
        r"\bна\s+\d{1,3}\s*(минут[уы]?|мин|час[а-я]*)\b",
        "",
        text,
        flags=re.IGNORECASE,
    )


async def resolve_secretary_user(db: AsyncSession, user_email: str | None = None) -> User | None:
    settings = get_settings()
    email = (user_email or settings.secretary_local_user_email or "").lower().strip()
    if email:
        result = await db.execute(select(User).where(User.email == email, User.is_active.is_(True)))
        user = result.scalar_one_or_none()
        if user is not None:
            return user

    result = await db.execute(
        select(User).where(User.is_founder.is_(True), User.is_active.is_(True))
    )
    user = result.scalar_one_or_none()
    if user is not None:
        return user

    result = await db.execute(select(User).where(User.is_active.is_(True)).order_by(User.id))
    return result.scalars().first()


async def handle_secretary_message(
    db: AsyncSession,
    text: str,
    user: User,
) -> SecretaryResponse:
    intent = parse_secretary_intent(text)

    if intent.name == "help":
        return _response(HELP_TEXT, SecretaryAction(type="help"))

    if intent.name == "list_tasks":
        return await _list_tasks_response(db, user)

    if intent.name == "send_telegram" and intent.message_text:
        return _response(
            "Готов отправить сообщение в Telegram.",
            SecretaryAction(type="send_telegram", message_text=intent.message_text),
        )

    if intent.name == "create_chat" and intent.telegram_chat_id is not None:
        return _response(
            "Готов создать Telegram-чат.",
            SecretaryAction(
                type="create_chat",
                telegram_chat_id=intent.telegram_chat_id,
                telegram_user_id=intent.telegram_user_id,
                telegram_username=intent.telegram_username,
                telegram_full_name=intent.telegram_full_name,
            ),
        )

    if intent.name == "create_task" and intent.title:
        client = await _ensure_personal_client(db)
        task = UserTask(
            title=intent.title,
            client_id=client.id,
            created_by_id=user.id,
            assigned_to_id=user.id,
            duration_minutes=intent.duration_minutes,
            input_data=text,
            goal="Личная задача из Telegram-секретаря",
            status="pending",
        )
        db.add(task)
        await db.commit()
        await db.refresh(task)
        duration = f" Оценка: {task.duration_minutes} мин." if task.duration_minutes else ""
        return _response(
            f"Принял задачу: {task.title}.{duration}",
            SecretaryAction(type="create_task", title=task.title, task_id=task.id),
        )

    return _response(
        "Пока не понял команду. Напиши `помощь`, и я покажу рабочие формулировки.",
        SecretaryAction(type="unknown"),
    )


async def _ensure_personal_client(db: AsyncSession) -> Client:
    result = await db.execute(select(Client).where(Client.name == PERSONAL_CLIENT_NAME))
    client = result.scalar_one_or_none()
    if client is not None:
        return client

    client = Client(name=PERSONAL_CLIENT_NAME)
    db.add(client)
    await db.commit()
    await db.refresh(client)
    return client


async def _list_tasks_response(db: AsyncSession, user: User) -> SecretaryResponse:
    result = await db.execute(
        select(UserTask)
        .where(UserTask.created_by_id == user.id, UserTask.status == "pending")
        .order_by(desc(UserTask.created_at))
        .limit(5)
    )
    tasks = result.scalars().all()
    if not tasks:
        return _response("Открытых задач пока нет.", SecretaryAction(type="list_tasks"))

    task_cards = [
        SecretaryTaskCard(
            id=task.id,
            title=task.title,
            start_time=task.start_time,
            duration_minutes=task.duration_minutes,
            preparation_notes=task.preparation_notes,
        )
        for task in tasks
    ]
    return _response(
        f"Нашёл открытые задачи: {len(task_cards)}.",
        SecretaryAction(type="list_tasks"),
        task_cards,
    )


def _response(
    text: str,
    action: SecretaryAction,
    tasks: list[SecretaryTaskCard] | None = None,
) -> SecretaryResponse:
    return SecretaryResponse(
        text=text,
        action=action,
        created_at=datetime.utcnow(),
        tasks=tasks or [],
    )
