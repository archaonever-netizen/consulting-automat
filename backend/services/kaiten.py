"""Управление подключением пользователя к Kaiten.

Хранит per-user связь (домен + зашифрованный токен), валидирует токен при
подключении и собирает готовый KaitenClient для запросов.
"""
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.crypto import decrypt, encrypt
from ..models import KaitenConnection
from .kaiten_client import KaitenClient


def _normalize_domain(domain: str) -> str:
    """Привести ввод к чистому хосту: убрать схему, пути, пробелы."""
    d = (domain or "").strip()
    d = d.removeprefix("https://").removeprefix("http://")
    d = d.split("/", 1)[0].strip()
    return d.rstrip(".")


async def get_connection(db: AsyncSession, user_id: int) -> KaitenConnection | None:
    result = await db.execute(
        select(KaitenConnection).where(KaitenConnection.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def connect(db: AsyncSession, user_id: int, domain: str, token: str) -> KaitenConnection:
    domain = _normalize_domain(domain)
    if not domain or not token.strip():
        raise HTTPException(status_code=400, detail="Укажите домен и токен Kaiten")

    # Проверяем токен живым запросом к Kaiten.
    client = KaitenClient(domain, token.strip())
    me = await client.get_current_user()

    conn = await get_connection(db, user_id)
    if conn is None:
        conn = KaitenConnection(user_id=user_id)
        db.add(conn)

    conn.domain = domain
    conn.token_encrypted = encrypt(token.strip())
    conn.kaiten_user_id = me.get("id")
    conn.kaiten_user_name = me.get("full_name") or me.get("username")
    conn.kaiten_email = me.get("email")

    await db.commit()
    await db.refresh(conn)
    return conn


async def disconnect(db: AsyncSession, user_id: int) -> bool:
    conn = await get_connection(db, user_id)
    if conn is None:
        return False
    await db.delete(conn)
    await db.commit()
    return True


async def get_client_for_user(db: AsyncSession, user_id: int) -> KaitenClient:
    conn = await get_connection(db, user_id)
    if conn is None:
        raise HTTPException(status_code=409, detail="Kaiten не подключён")
    return KaitenClient(conn.domain, decrypt(conn.token_encrypted))
