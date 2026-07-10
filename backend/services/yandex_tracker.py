from datetime import datetime, timedelta
from urllib.parse import urlencode

import httpx
from fastapi import HTTPException
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import get_settings
from ..core.crypto import decrypt, encrypt
from ..models import User, YandexTrackerConnection
from ..schemas.tracker import TrackerConnectRequest
from .yandex_tracker_client import YandexTrackerClient

YANDEX_OAUTH_AUTHORIZE_URL = "https://oauth.yandex.ru/authorize"
YANDEX_OAUTH_TOKEN_URL = "https://oauth.yandex.ru/token"
OAUTH_STATE_PURPOSE = "yandex_tracker_oauth"
OAUTH_STATE_TTL_MINUTES = 10
TOKEN_REFRESH_SKEW_SECONDS = 300

settings = get_settings()


def _clean(value: str | None) -> str | None:
    value = (value or "").strip()
    return value or None


def _tracker_org_from_settings() -> tuple[str | None, str | None]:
    org_id = _clean(settings.yandex_tracker_org_id)
    cloud_org_id = _clean(settings.yandex_tracker_cloud_org_id)
    if org_id and cloud_org_id:
        raise HTTPException(
            status_code=500,
            detail="Укажите только один Yandex Tracker organization id в настройках",
        )
    if not (org_id or cloud_org_id):
        raise HTTPException(
            status_code=500,
            detail="Не задан YANDEX_TRACKER_ORG_ID или YANDEX_TRACKER_CLOUD_ORG_ID",
        )
    return org_id, cloud_org_id


def _oauth_configured() -> None:
    if not settings.yandex_tracker_oauth_client_id or not settings.yandex_tracker_oauth_client_secret:
        raise HTTPException(
            status_code=500,
            detail="Не настроено OAuth-приложение Яндекс Трекера",
        )
    _tracker_org_from_settings()


def _token_expiry(expires_in: int | str | None) -> datetime | None:
    if expires_in is None:
        return None
    try:
        seconds = int(expires_in)
    except (TypeError, ValueError):
        return None
    return datetime.utcnow() + timedelta(seconds=max(seconds, 0))


def _state_for_user(user: User) -> str:
    payload = {
        "sub": str(user.id),
        "purpose": OAUTH_STATE_PURPOSE,
        "exp": datetime.utcnow() + timedelta(minutes=OAUTH_STATE_TTL_MINUTES),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def _user_id_from_state(state: str) -> int:
    credentials_exception = HTTPException(
        status_code=400,
        detail="OAuth state недействителен или устарел",
    )
    try:
        payload = jwt.decode(state, settings.secret_key, algorithms=[settings.algorithm])
        if payload.get("purpose") != OAUTH_STATE_PURPOSE:
            raise credentials_exception
        return int(payload.get("sub"))
    except (JWTError, TypeError, ValueError):
        raise credentials_exception


def build_oauth_authorization_url(user: User) -> str:
    _oauth_configured()
    params = {
        "response_type": "code",
        "client_id": settings.yandex_tracker_oauth_client_id,
        "redirect_uri": settings.yandex_tracker_oauth_redirect_uri,
        "scope": settings.yandex_tracker_oauth_scope,
        "state": _state_for_user(user),
        "force_confirm": "yes",
    }
    if user.email:
        params["login_hint"] = user.email
    return f"{YANDEX_OAUTH_AUTHORIZE_URL}?{urlencode(params)}"


def profile_redirect_url(*, connected: bool, message: str | None = None) -> str:
    params = {"yandex_tracker": "connected" if connected else "error"}
    if message:
        params["message"] = message
    # Приложение живёт под /app (на корне — продающий лендинг), поэтому профиль
    # после OAuth-колбэка трекера — /app/profile, иначе попадём на лендинг.
    return f"{settings.frontend_url.rstrip('/')}/app/profile?{urlencode(params)}"


async def _request_oauth_token(data: dict[str, str]) -> dict:
    payload = {
        **data,
        "client_id": settings.yandex_tracker_oauth_client_id,
        "client_secret": settings.yandex_tracker_oauth_client_secret,
    }
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(
                YANDEX_OAUTH_TOKEN_URL,
                data=payload,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Не удалось связаться с Яндекс OAuth: {exc}",
        ) from exc

    if resp.status_code >= 400:
        try:
            err = resp.json()
            detail = err.get("error_description") or err.get("error") or resp.text
        except ValueError:
            detail = resp.text
        raise HTTPException(status_code=400, detail=f"Ошибка Яндекс OAuth: {detail}")
    return resp.json()


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
    conn.refresh_token_encrypted = None
    conn.token_expires_at = None
    conn.tracker_user_id = str(me.get("uid") or me.get("trackerUid") or me.get("id") or "")
    conn.tracker_user_name = me.get("display") or " ".join(
        p for p in (me.get("firstName"), me.get("lastName")) if p
    )
    conn.tracker_email = me.get("email")
    conn.default_queue = default_queue.upper() if default_queue else None

    await db.commit()
    await db.refresh(conn)
    return conn


async def connect_with_oauth_code(
    db: AsyncSession,
    *,
    code: str,
    state: str,
) -> YandexTrackerConnection:
    _oauth_configured()
    user_id = _user_id_from_state(state)
    org_id, cloud_org_id = _tracker_org_from_settings()
    token_data = await _request_oauth_token({
        "grant_type": "authorization_code",
        "code": code,
    })
    access_token = token_data.get("access_token")
    if not access_token:
        raise HTTPException(status_code=400, detail="Яндекс OAuth не вернул access token")

    client = YandexTrackerClient(
        access_token,
        token_type="oauth",
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
    conn.token_type = "oauth"
    conn.token_encrypted = encrypt(access_token)
    refresh_token = token_data.get("refresh_token")
    conn.refresh_token_encrypted = encrypt(refresh_token) if refresh_token else None
    conn.token_expires_at = _token_expiry(token_data.get("expires_in"))
    conn.tracker_user_id = str(me.get("uid") or me.get("trackerUid") or me.get("id") or "")
    conn.tracker_user_name = me.get("display") or " ".join(
        p for p in (me.get("firstName"), me.get("lastName")) if p
    )
    conn.tracker_email = me.get("email")
    default_queue = _clean(settings.yandex_tracker_default_queue)
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


def _should_refresh(conn: YandexTrackerConnection) -> bool:
    if conn.token_type != "oauth" or not conn.refresh_token_encrypted:
        return False
    if conn.token_expires_at is None:
        return False
    return conn.token_expires_at <= datetime.utcnow() + timedelta(seconds=TOKEN_REFRESH_SKEW_SECONDS)


async def _refresh_oauth_connection(
    db: AsyncSession,
    conn: YandexTrackerConnection,
) -> None:
    _oauth_configured()
    refresh_token = decrypt(conn.refresh_token_encrypted or "")
    token_data = await _request_oauth_token({
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
    })
    access_token = token_data.get("access_token")
    if not access_token:
        raise HTTPException(status_code=400, detail="Яндекс OAuth не вернул новый access token")

    conn.token_encrypted = encrypt(access_token)
    next_refresh = token_data.get("refresh_token")
    if next_refresh:
        conn.refresh_token_encrypted = encrypt(next_refresh)
    conn.token_expires_at = _token_expiry(token_data.get("expires_in"))
    await db.commit()
    await db.refresh(conn)


async def get_client_for_user(db: AsyncSession, user_id: int) -> YandexTrackerClient:
    conn = await get_connection(db, user_id)
    if conn is None:
        raise HTTPException(status_code=409, detail="Яндекс Трекер не подключён")
    if _should_refresh(conn):
        await _refresh_oauth_connection(db, conn)
    return YandexTrackerClient(
        decrypt(conn.token_encrypted),
        token_type=conn.token_type,
        org_id=conn.org_id,
        cloud_org_id=conn.cloud_org_id,
    )
