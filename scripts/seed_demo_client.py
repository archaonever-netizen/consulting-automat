"""Создать клиента-витрину для демонстрации наполненного портала.

Идемпотентно: повторный запуск ничего не дублирует. Создаёт:
  • карточку клиента `portal_demo.DEMO_CLIENT_NAME` (со всеми брифами «Заполнено»,
    чтобы карточка в приложении выглядела «здоровой»);
  • одного сотрудника-клиента (вход в портал) со всеми разделами.

Демо-разделы портала (проект/этапы/статус/события/информация/документы) отдаёт
сам бэкенд для этого клиента (см. backend/services/portal_demo.py) — в БД их нет.

Запуск:  python -m scripts.seed_demo_client
"""
import asyncio

from sqlalchemy import select

from backend.core.database import AsyncSessionLocal, Base, engine
from backend.models import Brief, Client, ClientUser
from backend.services import portal_demo
from backend.services.briefs import COMMON_BRIEF_TYPES, MEDIUM_BRIEF_TYPES
from backend.schemas.portal_users import PORTAL_SECTIONS

DEMO_USER_EMAIL = "demo@teplyhleb.ru"
DEMO_USER_PASSWORD = "demo1234"
DEMO_USER_NAME = "Мария Пекарь"


async def main():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as session:
        # 1) Клиент
        existing = (await session.execute(
            select(Client).where(Client.name == portal_demo.DEMO_CLIENT_NAME)
        )).scalar_one_or_none()

        if existing:
            client = existing
            print(f"Клиент уже существует: #{client.id} «{client.name}»")
        else:
            client = Client(name=portal_demo.DEMO_CLIENT_NAME, business_size="medium")
            session.add(client)
            await session.flush()
            # Брифы «Заполнено» → карточка показывает health 100% «Хорошее».
            for bt in COMMON_BRIEF_TYPES + MEDIUM_BRIEF_TYPES:
                session.add(Brief(brief_type=bt, status="Заполнено", client_id=client.id))
            print(f"Создан клиент: #{client.id} «{client.name}» (+{len(COMMON_BRIEF_TYPES + MEDIUM_BRIEF_TYPES)} брифов)")

        # 2) Сотрудник-клиент для входа в портал
        user = (await session.execute(
            select(ClientUser).where(ClientUser.email == DEMO_USER_EMAIL)
        )).scalar_one_or_none()
        if user is None:
            user = ClientUser(
                client_id=client.id,
                email=DEMO_USER_EMAIL,
                full_name=DEMO_USER_NAME,
                role="Управляющая сети",
                sections=list(PORTAL_SECTIONS),
                is_active=True,
            )
            user.set_password(DEMO_USER_PASSWORD)
            session.add(user)
            print(f"Создан вход в портал: {DEMO_USER_EMAIL} / {DEMO_USER_PASSWORD}")
        else:
            print(f"Вход в портал уже существует: {DEMO_USER_EMAIL}")

        await session.commit()
        print("Готово. Откройте карточку клиента в приложении и нажмите «Вид для клиента».")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
