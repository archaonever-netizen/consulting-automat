from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.crypto import decrypt, encrypt
from ..models import YandexTrackerConnection
from ..schemas.tracker import TrackerConnectRequest
from .yandex_tracker_client import YandexTrackerClient


def _clean(value: str | None) -> str | None:
    value = (value or "").strip()
    return value or None


async def get_connection(
    db: AsyncSession,
    user_id: int,
) -> YandexTrackerConnection | None:
    result = await db.execute(
        select(YandexTrackerConnection).where(YandexTrackerConnection.user_id == user_id)
    )
    return result.scalar_one_or_none()


def connection_to_read(conn: YandexTrackerConnection | None) -> dict:
    if conn is None:
        return {"connected": False}
    return {
        "connected": True,
        "org_id": conn.org_id,
        "cloud_org_id": conn.cloud_org_id,
        "token_type": conn.token_type,
        "tracker_user_id": conn.tracker_user_id,
        "tracker_user_name": conn.tracker_user_name,
        "tracker_email": conn.tracker_email,
        "default_queue": conn.default_queue,
    }


async def connect(
    db: AsyncSession,
    user_id: int,
    data: TrackerConnectRequest,
) -> YandexTrackerConnection:
    token = data.token.strip()
    org_id = _clean(data.org_id)
    cloud_org_id = _clean(data.cloud_org_id)
    default_queue = _clean(data.default_queue)
    if not token:
        raise HTTPException(status_code=400, detail="Укажите токен Яндекс Трекера")

    client = YandexTrackerClient(
        token,
        token_type=data.token_type,
        org_id=org_id,
        cloud_org_id=cloud_org_id,
    )
    me = await client.get_current_user()

    conn = await get_connection(db, user_id)
    if conn is None:
        conn = YandexTrackerConnection(user_id=user_id)
        db.add(conn)

    conn.org_id = org_id
    conn.cloud_org_id = cloud_org_id
    conn.token_type = data.token_type
    conn.token_encrypted = encrypt(token)
    conn.tracker_user_id = str(me.get("uid") or me.get("trackerUid") or me.get("id") or "")
    conn.tracker_user_name = me.get("display") or " ".join(
        p for p in (me.get("firstName"), me.get("lastName")) if p
    )
    conn.tracker_email = me.get("email")
    conn.default_queue = default_queue.upper() if default_queue else None

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


async def get_client_for_user(db: AsyncSession, user_id: int) -> YandexTrackerClient:
    conn = await get_connection(db, user_id)
    if conn is None:
        raise HTTPException(status_code=409, detail="Яндекс Трекер не подключён")
    return YandexTrackerClient(
        decrypt(conn.token_encrypted),
        token_type=conn.token_type,
        org_id=conn.org_id,
        cloud_org_id=conn.cloud_org_id,
    )
