"""Управление клиентским порталом со стороны нашей компании (employee-side).

Доступ — ТОЛЬКО для сотрудников нашей компании (внутренний JWT). Сами клиенты
портала сюда не ходят (их контур — /api/portal). Здесь: сотрудники клиента
(«Организационная структура»), документы для клиента и выпуск preview-токена
для кнопки «Вид для клиента». Монтируется под префиксом /api/clients.
"""
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.database import get_db
from ..routes.auth import get_current_user_dep
from ..schemas.portal_users import PortalUserCreate, PortalUserUpdate
from ..services import client_documents as docs_service
from ..services import portal_auth
from ..services import portal_users as svc
from ..services.portal_users import EmailExists

router = APIRouter()

_MAX_UPLOAD_BYTES = 25 * 1024 * 1024  # 25 МБ на файл

_EMAIL_TAKEN = HTTPException(
    status_code=status.HTTP_409_CONFLICT,
    detail="Пользователь с таким email уже существует",
)
_CLIENT_NOT_FOUND = HTTPException(status_code=404, detail="Client not found")
_USER_NOT_FOUND = HTTPException(status_code=404, detail="Portal user not found")


@router.get("/{client_id}/portal-users")
async def list_portal_users(
    client_id: int,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    return await svc.list_portal_users(db, client_id)


@router.post("/{client_id}/portal-users", status_code=status.HTTP_201_CREATED)
async def create_portal_user(
    client_id: int,
    data: PortalUserCreate,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    try:
        user = await svc.create_portal_user(
            db, client_id, data, created_by_id=current_user.id
        )
    except EmailExists:
        raise _EMAIL_TAKEN
    if user is None:
        raise _CLIENT_NOT_FOUND
    return user


@router.put("/{client_id}/portal-users/{user_id}")
async def update_portal_user(
    client_id: int,
    user_id: int,
    data: PortalUserUpdate,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    try:
        user = await svc.update_portal_user(db, client_id, user_id, data)
    except EmailExists:
        raise _EMAIL_TAKEN
    if user is None:
        raise _USER_NOT_FOUND
    return user


@router.delete(
    "/{client_id}/portal-users/{user_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def delete_portal_user(
    client_id: int,
    user_id: int,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    success = await svc.delete_portal_user(db, client_id, user_id)
    if not success:
        raise _USER_NOT_FOUND


# ─────────────────────────── Документы для клиента ───────────────────────────

@router.get("/{client_id}/documents")
async def list_documents(
    client_id: int,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    return await docs_service.list_documents(db, client_id)


@router.post("/{client_id}/documents", status_code=status.HTTP_201_CREATED)
async def upload_document(
    client_id: int,
    file: UploadFile = File(...),
    title: str = Form(""),
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Пустой файл")
    if len(data) > _MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Файл больше 25 МБ")
    doc = await docs_service.create_document(
        db, client_id,
        title=title or file.filename or "Документ",
        original_filename=file.filename or "file",
        data=data,
        content_type=file.content_type or "application/octet-stream",
        uploaded_by_id=current_user.id,
    )
    if doc is None:
        raise _CLIENT_NOT_FOUND
    return doc


@router.delete("/{client_id}/documents/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    client_id: int,
    doc_id: int,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    success = await docs_service.delete_document(db, client_id, doc_id)
    if not success:
        raise HTTPException(status_code=404, detail="Документ не найден")


# ───────────────────────── «Вид для клиента» (preview) ───────────────────────

@router.post("/{client_id}/portal-preview")
async def create_portal_preview(
    client_id: int,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    """Короткий read-only токен портала для предпросмотра «как видит клиент».

    Показывает все разделы (полный вид клиента). Открывается на стороне фронта:
    /portal.html?preview=<token>.
    """
    from ..models import Client
    client = await db.get(Client, client_id)
    if client is None:
        raise _CLIENT_NOT_FOUND
    token = portal_auth.create_preview_token(client_id, full_name="Предпросмотр")
    return {"token": token}
