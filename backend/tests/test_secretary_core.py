import asyncio
import json

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from backend.core.config import get_settings
from backend.core.database import Base
from backend.models import Client, User, UserChatSession, UserSubChat, UserTask  # noqa: F401
from backend.services import chat_service
from backend.services.secretary_core import handle_secretary_message, parse_secretary_intent


async def _setup():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    db = session_factory()
    owner = User(email="owner@test.local", full_name="Owner", is_founder=True)
    owner.set_password("x")
    db.add(owner)
    await db.commit()
    return engine, db, owner


def test_parse_create_task_intent_with_duration():
    intent = parse_secretary_intent(
        "\u0434\u043e\u0431\u0430\u0432\u044c \u0437\u0430\u0434\u0430\u0447\u0443 "
        "\u043f\u043e\u0434\u0433\u043e\u0442\u043e\u0432\u0438\u0442\u044c "
        "\u041a\u041f \u043d\u0430 45 \u043c\u0438\u043d\u0443\u0442"
    )

    assert intent.name == "create_task"
    assert intent.title == "\u043f\u043e\u0434\u0433\u043e\u0442\u043e\u0432\u0438\u0442\u044c \u041a\u041f"
    assert intent.duration_minutes == 45


def test_parse_send_telegram_intent():
    intent = parse_secretary_intent(
        "\u043e\u0442\u043f\u0440\u0430\u0432\u044c "
        "\u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435 "
        "\u042f \u043d\u0430 \u0441\u0432\u044f\u0437\u0438"
    )

    assert intent.name == "send_telegram"
    assert intent.message_text == "\u042f \u043d\u0430 \u0441\u0432\u044f\u0437\u0438"


def test_parse_create_telegram_chat_intent():
    intent = parse_secretary_intent(
        "\u0441\u043e\u0437\u0434\u0430\u0442\u044c \u0447\u0430\u0442 "
        "123456 @client_user \u0418\u0432\u0430\u043d "
        "\u041f\u0435\u0442\u0440\u043e\u0432"
    )

    assert intent.name == "create_chat"
    assert intent.telegram_chat_id == 123456
    assert intent.telegram_user_id == 123456
    assert intent.telegram_username == "client_user"
    assert intent.telegram_full_name == "\u0418\u0432\u0430\u043d \u041f\u0435\u0442\u0440\u043e\u0432"


def test_telegram_chat_title_falls_back_to_id():
    title = chat_service.build_telegram_chat_title(telegram_chat_id=123456)

    assert title == "Telegram ID 123456"


def test_secretary_returns_send_telegram_action_without_side_effects():
    async def run():
        engine, db, owner = await _setup()
        try:
            response = await handle_secretary_message(
                db,
                "\u043e\u0442\u043f\u0440\u0430\u0432\u044c "
                "\u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435 "
                "\u041f\u0440\u0438\u0432\u0435\u0442",
                owner,
            )
            assert response.action.type == "send_telegram"
            assert response.action.message_text == "\u041f\u0440\u0438\u0432\u0435\u0442"
            assert response.tasks == []
        finally:
            await db.close()
            await engine.dispose()

    asyncio.run(run())


def test_secretary_returns_create_chat_action_without_side_effects():
    async def run():
        engine, db, owner = await _setup()
        try:
            response = await handle_secretary_message(
                db,
                "\u0441\u043e\u0437\u0434\u0430\u0442\u044c \u0447\u0430\u0442 123456",
                owner,
            )
            assert response.action.type == "create_chat"
            assert response.action.telegram_chat_id == 123456
            assert response.action.subchat_id is None
            assert response.tasks == []
        finally:
            await db.close()
            await engine.dispose()

    asyncio.run(run())


def test_create_or_update_telegram_subchat_syncs_title():
    async def run():
        engine, db, owner = await _setup()
        try:
            session = await chat_service.get_or_create_session(db, owner)
            subchat = await chat_service.create_or_update_telegram_subchat(
                db,
                session.id,
                telegram_chat_id=123456,
                telegram_user_id=123456,
                telegram_username="first_name",
            )
            updated = await chat_service.create_or_update_telegram_subchat(
                db,
                session.id,
                telegram_chat_id=123456,
                telegram_user_id=123456,
                telegram_username="second_name",
            )

            assert updated.id == subchat.id
            assert updated.source == "telegram"
            assert updated.title == "@second_name"
        finally:
            await db.close()
            await engine.dispose()

    asyncio.run(run())


def test_telegram_subchat_send_uses_bot_without_ai_response(monkeypatch):
    sent_messages = []

    async def fake_send(chat_id: int, text: str) -> None:
        sent_messages.append((chat_id, text))

    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "test-token")
    get_settings.cache_clear()
    monkeypatch.setattr(
        "backend.services.telegram_secretary.send_telegram_message",
        fake_send,
    )

    async def run():
        engine, db, owner = await _setup()
        try:
            session = await chat_service.get_or_create_session(db, owner)
            subchat = await chat_service.create_or_update_telegram_subchat(
                db,
                session.id,
                telegram_chat_id=123456,
                telegram_user_id=123456,
            )

            raw_events = [
                event async for event in chat_service.stream_response(db, subchat.id, "Hello")
            ]
            payloads = [
                json.loads(line.removeprefix("data: "))
                for event in raw_events
                for line in event.strip().splitlines()
                if line.startswith("data: ")
            ]
            messages = await chat_service.get_subchat_messages(db, subchat.id)

            assert sent_messages == [(123456, "Hello")]
            assert {"sent": True, "telegram_chat_id": 123456} in payloads
            assert [message.role for message in messages] == ["user"]
        finally:
            await db.close()
            await engine.dispose()
            get_settings.cache_clear()

    asyncio.run(run())


def test_secretary_creates_and_lists_task_cards():
    async def run():
        engine, db, owner = await _setup()
        try:
            created = await handle_secretary_message(
                db,
                "\u0437\u0430\u0434\u0430\u0447\u0430: "
                "\u043f\u043e\u0434\u0433\u043e\u0442\u043e\u0432\u0438\u0442\u044c "
                "\u043f\u043e\u0432\u0435\u0441\u0442\u043a\u0443 "
                "\u0441\u043e\u0437\u0432\u043e\u043d\u0430 \u043d\u0430 30 "
                "\u043c\u0438\u043d\u0443\u0442",
                owner,
            )
            assert created.action.type == "create_task"
            assert created.action.task_id is not None
            assert "\u041f\u0440\u0438\u043d\u044f\u043b \u0437\u0430\u0434\u0430\u0447\u0443" in created.text

            listed = await handle_secretary_message(
                db,
                "\u0437\u0430\u0434\u0430\u0447\u0438",
                owner,
            )
            assert listed.action.type == "list_tasks"
            assert listed.tasks
            assert listed.tasks[0].title == (
                "\u043f\u043e\u0434\u0433\u043e\u0442\u043e\u0432\u0438\u0442\u044c "
                "\u043f\u043e\u0432\u0435\u0441\u0442\u043a\u0443 "
                "\u0441\u043e\u0437\u0432\u043e\u043d\u0430"
            )
            assert listed.tasks[0].duration_minutes == 30
        finally:
            await db.close()
            await engine.dispose()

    asyncio.run(run())


def test_secretary_routes_registered():
    from backend.main import app

    paths = {getattr(r, "path", None) for r in app.routes}
    assert "/api/secretary/local/message" in paths
    assert "/api/secretary/telegram/send" in paths
    assert "/api/secretary/telegram/webhook" in paths
    assert "/api/chat/session/telegram-chats" in paths
