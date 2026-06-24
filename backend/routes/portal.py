"""Публичное API клиентского портала (/api/portal) — отдельный контур.

Витрина «только чтение»: единственное действие клиента — скачать документ.
Каждый ответ ограничен `client_id` из токена и фильтруется по разрешённым
разделам (`identity.sections`). Раздел, который не открыт сотруднику клиента,
не попадает в ответ вовсе.
"""
import time
from collections import defaultdict, deque

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.database import get_db
from ..schemas.auth import LoginRequest, TokenResponse
from ..schemas.portal_users import PORTAL_SECTIONS
from ..services import client_documents as docs_service
from ..services import portal_auth
from ..services import portal_requests as requests_service
from ..services import projects as project_service

router = APIRouter()
oauth2_portal = OAuth2PasswordBearer(tokenUrl="/api/portal/auth/login")

# Анти-перебор пароля портала: не более N попыток входа за окно на email.
_login_hits: dict[str, deque] = defaultdict(deque)
_LOGIN_LIMIT = 10
_LOGIN_WINDOW = 300.0  # 5 минут


def _login_rate_ok(email: str) -> bool:
    q = _login_hits[(email or "").lower().strip()]
    now = time.monotonic()
    while q and now - q[0] > _LOGIN_WINDOW:
        q.popleft()
    if len(q) >= _LOGIN_LIMIT:
        return False
    q.append(now)
    return True


async def get_identity(
    token: str = Depends(oauth2_portal),
    db: AsyncSession = Depends(get_db),
) -> portal_auth.PortalIdentity:
    return await portal_auth.resolve_identity(token, db)


@router.post("/auth/login", response_model=TokenResponse)
async def portal_login(data: LoginRequest, db: AsyncSession = Depends(get_db)):
    if not _login_rate_ok(data.email):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Слишком много попыток входа. Попробуйте через несколько минут.",
        )
    user = await portal_auth.authenticate_portal_user(db, data.email, data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный email или пароль",
        )
    return TokenResponse(access_token=portal_auth.create_portal_token(user))


@router.get("/me")
async def portal_me(
    identity: portal_auth.PortalIdentity = Depends(get_identity),
    db: AsyncSession = Depends(get_db),
):
    from ..models import Client
    client = await db.get(Client, identity.client_id)
    # Разделы возвращаем в каноничном порядке PORTAL_SECTIONS.
    allowed = [s for s in PORTAL_SECTIONS if identity.can(s)]
    # «Оставить заявку» — действие, а не раздел-витрина: доступно всем клиентам
    # независимо от выданных разделов, поэтому добавляем его в конец всегда.
    allowed.append("request")
    return {
        "full_name": identity.full_name,
        "is_preview": identity.is_preview,
        "client_id": identity.client_id,
        "client_name": client.name if client else "",
        "sections": allowed,
    }


@router.get("/data")
async def portal_data(
    identity: portal_auth.PortalIdentity = Depends(get_identity),
    db: AsyncSession = Depends(get_db),
):
    """Данные всех разрешённых разделов одним ответом (упрощает фронт портала).

    Разделы, которых ещё нет в модели (статус/этапы/события/информация), —
    скелет: возвращаем пусто, портал показывает заглушку. Будет дорабатываться.
    """
    out: dict = {}
    if identity.can("project"):
        out["project"] = await project_service.list_projects(db, client_id=identity.client_id)
    if identity.can("stages"):
        out["stages"] = []
    if identity.can("status"):
        out["status"] = None
    if identity.can("events"):
        out["events"] = []
    if identity.can("info"):
        out["info"] = None
    if identity.can("documents"):
        out["documents"] = await docs_service.list_documents(db, identity.client_id)
    return out


class PortalRequestCreate(BaseModel):
    """Заявка из портала: тема + сообщение, контакт для связи опционален."""
    subject: str
    message: str
    contact: str | None = None

    @field_validator("subject")
    @classmethod
    def _subject(cls, value: str) -> str:
        value = (value or "").strip()
        if not value:
            raise ValueError("Укажите тему заявки")
        return value[:200]

    @field_validator("message")
    @classmethod
    def _message(cls, value: str) -> str:
        value = (value or "").strip()
        if not value:
            raise ValueError("Опишите вашу заявку")
        return value[:5000]

    @field_validator("contact")
    @classmethod
    def _contact(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return (value.strip() or None)


@router.post("/requests", status_code=status.HTTP_201_CREATED)
async def portal_create_request(
    data: PortalRequestCreate,
    identity: portal_auth.PortalIdentity = Depends(get_identity),
    db: AsyncSession = Depends(get_db),
):
    """Клиент оставляет заявку. Превью «Вид для клиента» — read-only, заявку
    не создаёт (иначе наш сотрудник засорял бы данные клиента)."""
    if identity.is_preview:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="В режиме предпросмотра заявку отправить нельзя",
        )
    created = await requests_service.create_request(
        db,
        identity.client_id,
        subject=data.subject,
        message=data.message,
        contact=data.contact,
        author_name=identity.full_name,
        client_user_id=identity.user_id,
    )
    if created is None:
        raise HTTPException(status_code=404, detail="Клиент не найден")
    return created


@router.get("/documents/{doc_id}/download")
async def portal_download(
    doc_id: int,
    identity: portal_auth.PortalIdentity = Depends(get_identity),
    db: AsyncSession = Depends(get_db),
):
    if not identity.can("documents"):
        raise HTTPException(status_code=403, detail="Раздел недоступен")
    doc = await docs_service.get_document(db, identity.client_id, doc_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Документ не найден")
    data = docs_service.read_bytes(doc)
    if data is None:
        raise HTTPException(status_code=404, detail="Файл недоступен")
    # RFC 5987: имя файла с не-ASCII символами.
    from urllib.parse import quote
    disposition = f"attachment; filename*=UTF-8''{quote(doc.original_filename)}"
    return Response(
        content=data,
        media_type=doc.content_type or "application/octet-stream",
        headers={"Content-Disposition": disposition},
    )
