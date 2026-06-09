"""Create a test user for local development."""
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import async_sessionmaker
from backend.models import Base, User
from backend.core.config import get_settings

settings = get_settings()


async def main():
    engine = create_async_engine(settings.database_url)

    # Create tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        # Check if user exists
        from sqlalchemy import select
        result = await session.execute(select(User).where(User.email == "test@example.com"))
        existing_user = result.scalar_one_or_none()

        if existing_user:
            print(f"User already exists: {existing_user.email}")
        else:
            # Create test user
            user = User(
                email="test@example.com",
                full_name="Test User",
                is_founder=True,
                is_active=True,
            )
            user.set_password("password123")
            session.add(user)
            await session.commit()
            print(f"✓ Created user: test@example.com / password123")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
