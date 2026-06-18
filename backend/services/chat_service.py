"""Chat сервис с LangChain и SSE streaming."""
import json
from typing import AsyncGenerator

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_core.output_parsers import JsonOutputParser
from langchain_core.prompts import ChatPromptTemplate
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..core.config import DeepSeekConfig
from ..models import User, UserChatMessage, UserChatSession, UserSubChat, UserTask
from .knowledge import build_ai_digest
from .llm_client import get_llm

# Поля задачи, которые auto-fill дозаполняет из диалога
_TASK_FIELD_LABELS = {
    "input_data": "Входные данные",
    "goal": "Цель",
    "action_description": "Описание действий",
    "expected_result": "Ожидаемый результат",
}

_AUTOFILL_EXTRACT_PROMPT = """\
Ты извлекаешь структурированные данные из диалога о рабочей задаче.

Нужно заполнить ТОЛЬКО эти незаполненные поля:
{empty_fields}

Диалог:
{conversation}

Верни ТОЛЬКО JSON. Для каждого поля, значение которого ОДНОЗНАЧНО следует из диалога,
укажи строку-значение. Если данных для поля недостаточно — НЕ включай его в ответ.
Ничего не выдумывай, опирайся только на факты из диалога.

Формат (пример):
{{"goal": "...", "expected_result": "..."}}"""

_CHAT_SYSTEM_PROMPT = """\
Ты профессиональный ИИ-ассистент консалтинговой компании ШЕФ.

Твоя роль:
- Помогать менеджерам в работе с клиентами и задачами
- Анализировать ситуации и предлагать конкретные решения
- Составлять планы, чек-листы, документацию
- Давать профессиональные рекомендации

Принципы работы:
1. Отвечай конкретно и практично
2. Предлагай готовые к использованию результаты
3. Если задача связана с клиентом или задачей — используй контекст
4. Структурируй ответы для удобства чтения

{knowledge_base}{task_context}"""

_KNOWLEDGE_TEMPLATE = """\
Справочник о возможностях приложения ШЕФ (используй его, когда пользователь \
спрашивает, что умеет приложение, как им пользоваться, или что означает термин):
---
{digest}
---

"""

_TASK_CONTEXT_TEMPLATE = """\
Контекст задачи:
- Задача: {title}
- Клиент: {client}
- Описание: {description}
- Ожидаемый результат: {expected_result}
- Цель: {goal}"""


async def get_or_create_session(db: AsyncSession, user: User) -> UserChatSession:
    """Получить или создать сессию чата + гарантировать основной подчат «ИИ-Ассистент»."""
    result = await db.execute(
        select(UserChatSession)
        .where(UserChatSession.user_id == user.id)
        .options(selectinload(UserChatSession.subchats))
    )
    session = result.scalar_one_or_none()
    if not session:
        session = UserChatSession(user_id=user.id, title=f"Чат {user.full_name}")
        db.add(session)
        await db.commit()
        await db.refresh(session)

    # Основной чат — единственный подчат без task_id. Создаём один раз.
    res_main = await db.execute(
        select(UserSubChat).where(
            UserSubChat.session_id == session.id,
            UserSubChat.task_id.is_(None),
            UserSubChat.source == 'app',
        )
    )
    if res_main.scalars().first() is None:
        db.add(UserSubChat(session_id=session.id, task_id=None, source='app', version=1))
        await db.commit()
    return session


async def create_subchat(
    db: AsyncSession,
    session_id: int,
    task_id: int | None = None,
) -> UserSubChat:
    """Создать подчат. Для задачи — идемпотентно: если подчат для этой задачи уже
    есть, возвращаем его (не плодим новые при каждом обращении)."""
    if task_id is not None:
        res = await db.execute(
            select(UserSubChat).where(
                UserSubChat.session_id == session_id,
                UserSubChat.task_id == task_id,
            )
        )
        found = res.scalars().first()
        if found:
            return found

    result = await db.execute(
        select(UserSubChat)
        .where(UserSubChat.session_id == session_id)
        .order_by(UserSubChat.version.desc())
    )
    existing = result.scalars().all()
    version = max((s.version for s in existing), default=0) + 1

    subchat = UserSubChat(session_id=session_id, task_id=task_id, source='app', version=version)
    db.add(subchat)
    await db.commit()
    await db.refresh(subchat)
    return subchat


def build_telegram_chat_title(
    telegram_chat_id: int,
    telegram_user_id: int | None = None,
    telegram_username: str | None = None,
    telegram_full_name: str | None = None,
) -> str:
    """Build the compact title shown in the AI chats sidebar."""
    username = (telegram_username or "").strip().lstrip("@")
    full_name = (telegram_full_name or "").strip()
    if username:
        return f"@{username}"
    if full_name:
        return full_name
    return f"Telegram ID {telegram_user_id or telegram_chat_id}"


async def create_or_update_telegram_subchat(
    db: AsyncSession,
    session_id: int,
    telegram_chat_id: int,
    telegram_user_id: int | None = None,
    telegram_username: str | None = None,
    telegram_full_name: str | None = None,
) -> UserSubChat:
    title = build_telegram_chat_title(
        telegram_chat_id=telegram_chat_id,
        telegram_user_id=telegram_user_id,
        telegram_username=telegram_username,
        telegram_full_name=telegram_full_name,
    )
    identity_filter = (
        UserSubChat.telegram_user_id == telegram_user_id
        if telegram_user_id is not None
        else UserSubChat.telegram_chat_id == telegram_chat_id
    )
    result = await db.execute(
        select(UserSubChat).where(
            UserSubChat.session_id == session_id,
            UserSubChat.source == 'telegram',
            identity_filter,
        )
    )
    subchat = result.scalars().first()
    username = (telegram_username or "").strip().lstrip("@") or None
    full_name = (telegram_full_name or "").strip() or None
    if subchat is not None:
        subchat.title = title
        subchat.telegram_chat_id = telegram_chat_id
        subchat.telegram_user_id = telegram_user_id
        subchat.telegram_username = username
        subchat.telegram_full_name = full_name
        await db.commit()
        await db.refresh(subchat)
        return subchat

    version_result = await db.execute(
        select(UserSubChat)
        .where(UserSubChat.session_id == session_id)
        .order_by(UserSubChat.version.desc())
    )
    existing = version_result.scalars().all()
    version = max((s.version for s in existing), default=0) + 1
    subchat = UserSubChat(
        session_id=session_id,
        task_id=None,
        title=title,
        source='telegram',
        telegram_chat_id=telegram_chat_id,
        telegram_user_id=telegram_user_id,
        telegram_username=username,
        telegram_full_name=full_name,
        version=version,
    )
    db.add(subchat)
    await db.commit()
    await db.refresh(subchat)
    return subchat


async def delete_subchat(db: AsyncSession, subchat_id: int) -> str:
    """Удалить подчат. Основной чат (task_id=None) удалять нельзя."""
    sub = await db.get(UserSubChat, subchat_id)
    if sub is None:
        return 'notfound'
    if sub.task_id is None and sub.source != 'telegram':
        return 'main'
    await db.delete(sub)
    await db.commit()
    return 'ok'


async def get_subchat_messages(db: AsyncSession, subchat_id: int) -> list[UserChatMessage]:
    """Получить все сообщения в подчате."""
    result = await db.execute(
        select(UserChatMessage)
        .where(UserChatMessage.subchat_id == subchat_id)
        .order_by(UserChatMessage.created_at)
    )
    return result.scalars().all()


async def _autofill_task(
    db: AsyncSession,
    task: UserTask,
    assistant_response: str,
    history: list[UserChatMessage],
) -> dict[str, str]:
    """
    Дозаполнить пустые поля задачи на основе диалога.
    Фикс старого бага: извлечение вынесено в ОТДЕЛЬНЫЙ structured-вызов
    (temperature=0, JSON), а не парсинг inline-JSON из основного ответа —
    поэтому поля реально записываются в БД после опроса.
    """
    empty = {
        f: lbl for f, lbl in _TASK_FIELD_LABELS.items()
        if not (getattr(task, f) or "").strip()
    }
    if not empty:
        return {}

    convo_lines = [f"{m.role}: {m.content}" for m in history]
    convo_lines.append(f"assistant: {assistant_response}")
    conversation = "\n".join(convo_lines)
    fields_desc = "\n".join(f"- {f}: {lbl}" for f, lbl in empty.items())

    llm = get_llm(model=DeepSeekConfig.CHAT_MODEL, temperature=0.0)
    chain = ChatPromptTemplate.from_template(_AUTOFILL_EXTRACT_PROMPT) | llm | JsonOutputParser()

    try:
        data = await chain.ainvoke({"empty_fields": fields_desc, "conversation": conversation})
    except Exception:
        return {}

    if not isinstance(data, dict):
        return {}

    filled: dict[str, str] = {}
    for key, value in data.items():
        if key in empty and isinstance(value, str) and value.strip():
            setattr(task, key, value.strip())
            filled[_TASK_FIELD_LABELS[key]] = value.strip()

    if filled:
        await db.commit()
    return filled


async def _build_system_prompt(db: AsyncSession, subchat: UserSubChat) -> str:
    """Построить системный промпт: База знаний + контекст задачи если есть."""
    knowledge_base = ""
    try:
        digest = await build_ai_digest(db)
        if digest:
            knowledge_base = _KNOWLEDGE_TEMPLATE.format(digest=digest)
    except Exception:
        knowledge_base = ""  # БЗ не должна ломать чат

    task_context = ""
    if subchat.task_id and subchat.task:
        task = subchat.task
        client_name = task.client.name if task.client else "не указан"
        task_context = _TASK_CONTEXT_TEMPLATE.format(
            title=task.title,
            client=client_name,
            description=task.input_data or "не указано",
            expected_result=task.expected_result or "не указано",
            goal=task.goal or "не указано",
        )
        empty = [
            lbl
            for f, lbl in _TASK_FIELD_LABELS.items()
            if not (getattr(task, f) or "").strip()
        ]
        if empty:
            task_context += (
                "\n\nНезаполненные поля задачи: " + ", ".join(empty) + ".\n"
                "Задавай пользователю уточняющие вопросы по этим полям — по одному за раз, "
                "естественно и по делу. Поля будут сохранены автоматически, "
                "тебе НЕ нужно выводить JSON."
            )
    return _CHAT_SYSTEM_PROMPT.format(knowledge_base=knowledge_base, task_context=task_context)


async def stream_response(
    db: AsyncSession,
    subchat_id: int,
    user_message: str,
) -> AsyncGenerator[str, None]:
    """
    Стриминг ответа ИИ через LangChain.
    Yield: SSE строки формата 'data: {...}\n\n'
    Сохраняет user_message и ответ в БД.
    """
    # Загрузить подчат вместе с задачей и её клиентом.
    # task.client грузим явно — иначе доступ к нему в async даст MissingGreenlet.
    result = await db.execute(
        select(UserSubChat)
        .where(UserSubChat.id == subchat_id)
        .options(selectinload(UserSubChat.task).selectinload(UserTask.client))
    )
    subchat = result.scalar_one_or_none()
    if not subchat:
        yield f"data: {json.dumps({'error': 'Subchat not found'})}\n\n"
        return

    if subchat.source == 'telegram':
        user_msg_record = UserChatMessage(
            subchat_id=subchat_id,
            role="user",
            content=user_message,
        )
        db.add(user_msg_record)
        await db.commit()

        if subchat.telegram_chat_id is None:
            yield f"data: {json.dumps({'error': 'Telegram chat_id is missing'})}\n\n"
            return

        from ..core.config import get_settings
        from .telegram_secretary import send_telegram_message

        settings = get_settings()
        if not settings.telegram_bot_token:
            yield f"data: {json.dumps({'error': 'TELEGRAM_BOT_TOKEN is not configured'})}\n\n"
            return
        try:
            await send_telegram_message(subchat.telegram_chat_id, user_message)
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            return

        sent_event = {'sent': True, 'telegram_chat_id': subchat.telegram_chat_id}
        yield f"data: {json.dumps(sent_event)}\n\n"
        yield f"data: {json.dumps({'done': True})}\n\n"
        return

    # Сохранить сообщение пользователя в БД
    user_msg_record = UserChatMessage(
        subchat_id=subchat_id,
        role="user",
        content=user_message,
    )
    db.add(user_msg_record)
    await db.commit()

    # Загрузить историю
    messages = await get_subchat_messages(db, subchat_id)
    system_prompt = await _build_system_prompt(db, subchat)

    # Построить LangChain messages
    lc_messages: list = [SystemMessage(content=system_prompt)]
    for msg in messages:
        if msg.role == "user":
            lc_messages.append(HumanMessage(content=msg.content))
        elif msg.role == "assistant":
            lc_messages.append(AIMessage(content=msg.content))

    # Стримить ответ
    llm = get_llm(
        model=DeepSeekConfig.CHAT_MODEL,
        temperature=0.7,
        streaming=True,
    )

    full_response = ""
    errored = False
    try:
        async for chunk in llm.astream(lc_messages):
            delta = chunk.content
            if delta:
                full_response += delta
                yield f"data: {json.dumps({'chunk': delta})}\n\n"
    except Exception as e:
        errored = True
        yield f"data: {json.dumps({'error': str(e)})}\n\n"

    # Сохранить ответ ассистента (даже частичный при ошибке)
    if full_response:
        db.add(UserChatMessage(subchat_id=subchat_id, role="assistant", content=full_response))
        subchat.tokens_used += len(full_response.split()) + len(user_message.split())
        await db.commit()

    if errored:
        return

    # Auto-fill: если подчат привязан к задаче — дозаполнить её поля из диалога
    if subchat.task_id and subchat.task:
        filled = await _autofill_task(db, subchat.task, full_response, messages)
        if filled:
            yield f"data: {json.dumps({'filled': filled})}\n\n"

    yield f"data: {json.dumps({'done': True})}\n\n"
