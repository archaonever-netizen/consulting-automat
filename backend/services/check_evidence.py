"""Файлы-свидетельства проверок гипотез в Supabase Storage (server-only).

Инструмент «Проверки» (раздел Проекты → Программирование) прикладывает к проверке
гипотезы файлы-свидетельства. МЕТАДАННЫЕ свидетельства (название, позиция за/против,
измеренное значение) живут на фронте в изолированном поле `evidence` секции `experiments`
(lossless-снапшот) — здесь только ХРАНЕНИЕ БАЙТОВ файла.

Путь объекта строго ограничен префиксом `project-<id>/checks/<check_id>/`, чтобы один
проект/проверка не могли прочитать или удалить файл другого (scoping вместо RLS, т.к.
ходим под service_role-ключом). Тонкая обёртка над services/storage_client.
"""
from __future__ import annotations

import re
import uuid

from . import storage_client

_SAFE = re.compile(r"[^A-Za-z0-9._-]+")
# Сегмент пути (id проверки) — без точек, чтобы исключить «..» в построении префикса.
_SAFE_SEGMENT = re.compile(r"[^A-Za-z0-9_-]+")
# Потолок на один файл — защита от случайной выгрузки гигантов (метаданные у нас на фронте).
MAX_EVIDENCE_BYTES = 25 * 1024 * 1024  # 25 МБ


def safe_name(name: str) -> str:
    """Имя файла, безопасное для пути в Storage (латиница/цифры/._-), с обрезкой длины."""
    name = (name or "file").strip().replace(" ", "_")
    name = _SAFE.sub("", name) or "file"
    return name[:120]


def _safe_segment(value: str) -> str:
    """Сегмент пути (id проверки): только [A-Za-z0-9_-], иначе ошибка (отсекает «..», слэши)."""
    seg = _SAFE_SEGMENT.sub("", (value or "").strip())
    if not seg:
        raise ValueError("Некорректный идентификатор проверки")
    return seg[:64]


def evidence_prefix(project_id: int, check_id: str) -> str:
    """Префикс всех файлов одной проверки: `project-<id>/checks/<check_id>/`."""
    return f"project-{int(project_id)}/checks/{_safe_segment(check_id)}/"


def build_path(project_id: int, check_id: str, filename: str) -> str:
    """Уникальный путь объекта внутри префикса проверки (uuid защищает от перезаписи)."""
    return f"{evidence_prefix(project_id, check_id)}{uuid.uuid4().hex}__{safe_name(filename)}"


def is_within(project_id: int, check_id: str, path: str) -> bool:
    """Лежит ли `path` строго внутри области данной проверки (anti path-traversal)."""
    prefix = evidence_prefix(project_id, check_id)
    return bool(path) and path.startswith(prefix) and ".." not in path


def upload_evidence(project_id: int, check_id: str, filename: str, data: bytes, content_type: str) -> dict:
    """Залить файл-свидетельство, вернуть метаданные для записи в поле `evidence` на фронте."""
    storage_client.ensure_bucket()
    path = build_path(project_id, check_id, filename)
    storage_client.upload(path, data, content_type=content_type or "application/octet-stream")
    return {
        "storagePath": path,
        "filename": safe_name(filename),
        "mime": content_type or "application/octet-stream",
        "size": len(data),
    }


def download_evidence(project_id: int, check_id: str, path: str) -> bytes:
    """Скачать байты файла-свидетельства, предварительно проверив область проверки."""
    if not is_within(project_id, check_id, path):
        raise ValueError("Файл вне области этой проверки")
    return storage_client.download(path)


def delete_evidence(project_id: int, check_id: str, path: str) -> None:
    """Удалить файл-свидетельство (идемпотентно), проверив область проверки."""
    if not is_within(project_id, check_id, path):
        raise ValueError("Файл вне области этой проверки")
    storage_client.delete(path)


def filename_from_path(path: str) -> str:
    """Исходное имя файла из пути (после `<uuid>__`)."""
    tail = path.rsplit("/", 1)[-1]
    return tail.split("__", 1)[-1] or "file"
