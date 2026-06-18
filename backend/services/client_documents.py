"""Документы клиента: хранение файла + строка в БД.

Этап 2: файлы лежат на ЛОКАЛЬНОЙ файловой системе под `instance/client_documents/
<client_id>/<uuid>__<safe_name>`. Этого достаточно для локальной разработки и
одного сервера. При выносе портала на отдельный сервер (Этап 3) хранилище можно
сменить на Supabase Storage (см. services/storage_client) — точкой замены служит
этот модуль.
"""
from __future__ import annotations

import os
import re
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Client, ClientDocument

# instance/ рядом с корнем проекта (backend/ лежит на уровень ниже).
_BASE_DIR = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "..", "instance", "client_documents")
)

_SAFE = re.compile(r"[^A-Za-z0-9._-]+")


def _safe_name(name: str) -> str:
    name = (name or "file").strip().replace(" ", "_")
    name = _SAFE.sub("", name) or "file"
    return name[:120]


def _abs_path(stored_path: str) -> str:
    """Абсолютный путь из относительного `stored_path`, защищён от path traversal."""
    candidate = os.path.normpath(os.path.join(_BASE_DIR, stored_path))
    if not candidate.startswith(_BASE_DIR + os.sep):
        raise ValueError("Некорректный путь файла")
    return candidate


def _to_dict(d: ClientDocument) -> dict:
    return {
        "id": d.id,
        "client_id": d.client_id,
        "title": d.title,
        "original_filename": d.original_filename,
        "content_type": d.content_type,
        "size_bytes": d.size_bytes,
        "created_at": d.created_at,
        "created_at_fmt": d.created_at.strftime("%d.%m.%Y") if d.created_at else "—",
    }


async def list_documents(db: AsyncSession, client_id: int) -> list[dict]:
    result = await db.execute(
        select(ClientDocument)
        .where(ClientDocument.client_id == client_id)
        .order_by(ClientDocument.created_at.desc())
    )
    return [_to_dict(d) for d in result.scalars().all()]


async def create_document(
    db: AsyncSession,
    client_id: int,
    *,
    title: str,
    original_filename: str,
    data: bytes,
    content_type: str,
    uploaded_by_id: int | None = None,
) -> dict | None:
    client = await db.get(Client, client_id)
    if client is None:
        return None
    rel_dir = str(client_id)
    os.makedirs(os.path.join(_BASE_DIR, rel_dir), exist_ok=True)
    fname = f"{uuid.uuid4().hex}__{_safe_name(original_filename)}"
    rel_path = os.path.join(rel_dir, fname)
    with open(os.path.join(_BASE_DIR, rel_path), "wb") as fh:
        fh.write(data)

    doc = ClientDocument(
        client_id=client_id,
        title=(title or original_filename).strip(),
        original_filename=original_filename,
        stored_path=rel_path.replace(os.sep, "/"),
        content_type=content_type or "application/octet-stream",
        size_bytes=len(data),
        uploaded_by_id=uploaded_by_id,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return _to_dict(doc)


async def get_document(db: AsyncSession, client_id: int, doc_id: int) -> ClientDocument | None:
    result = await db.execute(
        select(ClientDocument).where(
            ClientDocument.id == doc_id, ClientDocument.client_id == client_id
        )
    )
    return result.scalar_one_or_none()


def read_bytes(doc: ClientDocument) -> bytes | None:
    """Прочитать файл с диска. None — если файл пропал (строка осталась)."""
    try:
        path = _abs_path(doc.stored_path)
    except ValueError:
        return None
    if not os.path.isfile(path):
        return None
    with open(path, "rb") as fh:
        return fh.read()


async def delete_document(db: AsyncSession, client_id: int, doc_id: int) -> bool:
    doc = await get_document(db, client_id, doc_id)
    if doc is None:
        return False
    try:
        path = _abs_path(doc.stored_path)
        if os.path.isfile(path):
            os.remove(path)
    except (ValueError, OSError):
        pass  # файла нет — всё равно убираем строку
    await db.delete(doc)
    await db.commit()
    return True
