"""Create a test user for local development.

Использует то же подключение к БД, что и приложение (backend.core.database),
поэтому работает и со SQLite, и с Postgres из DATABASE_URL.

ВНИМАНИЕ: если DATABASE_URL в .env.local указывает на облачную базу,
пользователь создастся именно там.
"""
import asyncio

from sqlalchemy import select

from backend.core.database import AsyncSessionLocal, Base, engine
from backend.models import User


async def main():
    # Create tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User).where(User.email == "test@example.com"))
        existing_user = result.scalar_one_or_none()

        if existing_user:
            print(f"User already exists: {existing_user.email}")
        else:
            user = User(
                email="test@example.com",
                full_name="Test User",
                is_founder=False,
                is_active=True,
            )
            user.set_password("password123")
            session.add(user)
            await session.commit()
            print("Created user: test@example.com / password123")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
