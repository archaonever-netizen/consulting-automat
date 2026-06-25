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
from dataclasses import dataclass
from urllib.parse import urlparse

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Client, ClientDocument

# instance/ рядом с корнем проекта (backend/ лежит на уровень ниже).
_BASE_DIR = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "..", "instance", "client_documents")
)

_SAFE = re.compile(r"[^A-Za-z0-9._-]+")
SOURCE_LOCAL = "local"
SOURCE_YANDEX_DISK = "yandex_disk"
_YANDEX_DOWNLOAD_URL = "https://cloud-api.yandex.net/v1/disk/public/resources/download"
_YANDEX_HOSTS = {
    "disk.yandex.ru",
    "disk.yandex.com",
    "yadi.sk",
    "yandex.ru",
}


@dataclass(frozen=True)
class DownloadPayload:
    data: bytes
    content_type: str
    filename: str


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
    source_type = d.source_type or SOURCE_LOCAL
    return {
        "id": d.id,
        "client_id": d.client_id,
        "title": d.title,
        "original_filename": d.original_filename,
        "source_type": source_type,
        "source_label": "Яндекс Диск" if source_type == SOURCE_YANDEX_DISK else "Файл",
        "content_type": d.content_type,
        "size_bytes": d.size_bytes,
        "created_at": d.created_at,
        "created_at_fmt": d.created_at.strftime("%d.%m.%Y") if d.created_at else "—",
    }


def normalize_yandex_disk_url(url: str) -> str:
    value = (url or "").strip()
    if len(value) > 2000:
        raise ValueError("Ссылка слишком длинная")
    parsed = urlparse(value)
    host = parsed.netloc.lower()
    if parsed.scheme != "https" or host not in _YANDEX_HOSTS:
        raise ValueError("Укажите публичную https-ссылку Яндекс Диска")
    if not parsed.path or parsed.path == "/":
        raise ValueError("Ссылка Яндекс Диска должна вести на документ")
    return value


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


async def create_yandex_disk_document(
    db: AsyncSession,
    client_id: int,
    *,
    title: str,
    url: str,
    original_filename: str | None = None,
    uploaded_by_id: int | None = None,
) -> dict | None:
    client = await db.get(Client, client_id)
    if client is None:
        return None
    normalized_url = normalize_yandex_disk_url(url)
    clean_title = (title or original_filename or "Документ из Яндекс Диска").strip()
    clean_filename = (original_filename or clean_title).strip()[:255] or "yandex-disk-document"
    doc = ClientDocument(
        client_id=client_id,
        title=clean_title[:255],
        original_filename=clean_filename,
        stored_path="",
        source_type=SOURCE_YANDEX_DISK,
        external_url=normalized_url,
        content_type="application/octet-stream",
        size_bytes=0,
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


async def download_yandex_disk_document(doc: ClientDocument) -> DownloadPayload:
    if (doc.source_type or SOURCE_LOCAL) != SOURCE_YANDEX_DISK or not doc.external_url:
        raise ValueError("Документ не является ссылкой Яндекс Диска")

    timeout = httpx.Timeout(connect=10.0, read=120.0, write=10.0, pool=10.0)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        meta = await client.get(_YANDEX_DOWNLOAD_URL, params={"public_key": doc.external_url})
        if meta.status_code == 404:
            raise FileNotFoundError(
                "Яндекс Диск не нашёл документ. Проверьте, что ссылка публичная."
            )
        meta.raise_for_status()
        href = meta.json().get("href")
        if not isinstance(href, str) or not href:
            raise ValueError("Яндекс Диск не вернул ссылку скачивания")

        response = await client.get(href)
        if response.status_code == 404:
            raise FileNotFoundError("Файл на Яндекс Диске недоступен")
        response.raise_for_status()
        return DownloadPayload(
            data=response.content,
            content_type=response.headers.get("content-type") or "application/octet-stream",
            filename=doc.original_filename or doc.title or "document",
        )


async def delete_document(db: AsyncSession, client_id: int, doc_id: int) -> bool:
    doc = await get_document(db, client_id, doc_id)
    if doc is None:
        return False
    if (doc.source_type or SOURCE_LOCAL) == SOURCE_LOCAL:
        try:
            path = _abs_path(doc.stored_path)
            if os.path.isfile(path):
                os.remove(path)
        except (ValueError, OSError):
            pass  # файла нет — всё равно убираем строку
    await db.delete(doc)
    await db.commit()
    return True
