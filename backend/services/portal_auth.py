"""Авторизация клиентского портала — ОТДЕЛЬНАЯ от сотрудников компании.

Свой секрет (`portal_secret_key`) и обязательный claim `aud="portal"`: внутренний
токен сотрудника на портальных ручках не пройдёт, и наоборот. Identity бывает
двух видов:
  • реальный сотрудник клиента (`ClientUser`) — вход по логину/паролю;
  • предпросмотр «Вид для клиента» — короткий токен, выпускаемый нашим
    сотрудником; не привязан к `ClientUser`, доступ только на чтение.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta

from fastapi import HTTPException, status
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import get_settings
from ..models import ClientUser
from ..schemas.portal_users import PORTAL_SECTIONS

settings = get_settings()

_AUDIENCE = "portal"


@dataclass
class PortalIdentity:
    """Кто обращается к порталу (реальный клиент или предпросмотр сотрудника)."""
    client_id: int
    full_name: str
    sections: list[str] = field(default_factory=list)
    is_preview: bool = False
    user_id: int | None = None  # id ClientUser (None для preview)

    def can(self, section: str) -> bool:
        return section in self.sections


def _encode(payload: dict, expire_minutes: int) -> str:
    data = payload.copy()
    data.update({
        "aud": _AUDIENCE,
        "exp": datetime.utcnow() + timedelta(minutes=expire_minutes),
    })
    return jwt.encode(data, settings.portal_secret_key, algorithm=settings.algorithm)


def create_portal_token(user: ClientUser) -> str:
    """Токен для реального сотрудника клиента после успешного входа."""
    return _encode(
        {"sub": str(user.id), "client_id": user.client_id, "preview": False},
        settings.portal_token_expire_minutes,
    )


def create_preview_token(client_id: int, full_name: str = "Предпросмотр") -> str:
    """Короткий read-only токен для кнопки «Вид для клиента» (видны все разделы)."""
    return _encode(
        {"sub": "preview", "client_id": client_id, "preview": True, "name": full_name},
        settings.portal_preview_expire_minutes,
    )


async def authenticate_portal_user(
    db: AsyncSession, email: str, password: str
) -> ClientUser | None:
    email_n = (email or "").lower().strip()
    result = await db.execute(select(ClientUser).where(ClientUser.email == email_n))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        return None
    if not user.check_password(password):
        return None
    return user


async def resolve_identity(token: str, db: AsyncSession) -> PortalIdentity:
    """Проверить портальный токен и вернуть identity. 401 при любой проблеме."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Доступ к порталу не подтверждён",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(
            token,
            settings.portal_secret_key,
            algorithms=[settings.algorithm],
            audience=_AUDIENCE,
        )
        client_id = int(payload["client_id"])
    except (JWTError, KeyError, TypeError, ValueError):
        raise credentials_exception from None

    if payload.get("preview"):
        return PortalIdentity(
            client_id=client_id,
            full_name=str(payload.get("name") or "Предпросмотр"),
            sections=list(PORTAL_SECTIONS),
            is_preview=True,
        )

    # Реальный клиент: подтягиваем актуальные данные (роль/разделы/активность
    # могли измениться после выдачи токена).
    try:
        user_id = int(payload["sub"])
    except (KeyError, TypeError, ValueError):
        raise credentials_exception from None
    user = await db.get(ClientUser, user_id)
    if user is None or not user.is_active or user.client_id != client_id:
        raise credentials_exception
    return PortalIdentity(
        client_id=user.client_id,
        full_name=user.full_name,
        sections=list(user.sections or []),
        is_preview=False,
        user_id=user.id,
    )
