"""Хранение состояния карточек фреймворка проекта в БД.

Одна строка ProjectCardState на (project_id, card_id) держит и введённое
содержимое карточки (content_json), и последний результат ИИ-валидатора
(validation_json). Сервис — тонкий слой upsert/чтения поверх модели.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Project, ProjectCardState


async def project_exists(db: AsyncSession, project_id: int) -> bool:
    return (await db.get(Project, project_id)) is not None


def _serialize(row: ProjectCardState) -> dict:
    return {
        "card_id": row.card_id,
        "content": row.content_json,
        "validation": row.validation_json,
        "validated_at": row.validated_at.isoformat() if row.validated_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


async def list_cards(db: AsyncSession, project_id: int) -> list[dict]:
    rows = (await db.scalars(
        select(ProjectCardState).where(ProjectCardState.project_id == project_id)
    )).all()
    return [_serialize(r) for r in rows]


async def _get_or_create(db: AsyncSession, project_id: int, card_id: str) -> ProjectCardState:
    row = (await db.scalars(
        select(ProjectCardState).where(
            ProjectCardState.project_id == project_id,
            ProjectCardState.card_id == card_id,
        )
    )).first()
    if row is None:
        row = ProjectCardState(project_id=project_id, card_id=card_id)
        db.add(row)
    return row


async def upsert_content(db: AsyncSession, project_id: int, card_id: str, content: dict) -> dict:
    """Сохранить введённое содержимое карточки (данные из строк/полей)."""
    row = await _get_or_create(db, project_id, card_id)
    row.content_json = content
    await db.commit()
    await db.refresh(row)
    return _serialize(row)


async def save_validation(db: AsyncSession, project_id: int, card_id: str, validation: dict) -> dict:
    """Сохранить последний результат ИИ-валидатора для карточки."""
    row = await _get_or_create(db, project_id, card_id)
    row.validation_json = validation
    row.validated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(row)
    return _serialize(row)


# Служебная «карточка» для проектного ИИ-Методолога: хранит последнюю оценку всего проекта
# (validation_json) и историю чата (content_json.messages). card_id не пересекается с реальными.
REVIEW_CARD_ID = "__project_review__"
_MAX_CHAT_MESSAGES = 30


def _chat_key(card_id: str | None) -> str:
    """Ключ чата: своя ветка на каждую карточку-фокус; пусто/секция → общий чат."""
    return card_id or "__general__"


def _chat_entry(content: dict, card_id: str | None) -> dict:
    """Запись чата {messages, plan} для карточки. Учитывает legacy-формат (единый чат)."""
    chats = content.get("chats")
    if isinstance(chats, dict):
        entry = chats.get(_chat_key(card_id))
        return entry if isinstance(entry, dict) else {}
    # обратная совместимость: старый единый чат показываем в общей ветке
    if _chat_key(card_id) == "__general__" and isinstance(content.get("messages"), list):
        return {"messages": content.get("messages", []), "plan": content.get("plan")}
    return {}


async def get_review(db: AsyncSession, project_id: int, card_id: str | None = None) -> dict:
    """Вернуть сохранённую оценку проекта (общую) и чат/план карточки-фокуса для гидрации."""
    row = (await db.scalars(
        select(ProjectCardState).where(
            ProjectCardState.project_id == project_id,
            ProjectCardState.card_id == REVIEW_CARD_ID,
        )
    )).first()
    if row is None:
        return {"review": None, "messages": [], "plan": None}
    content = row.content_json if isinstance(row.content_json, dict) else {}
    chat = _chat_entry(content, card_id)
    return {
        "review": row.validation_json,
        "messages": chat.get("messages", []),
        "plan": chat.get("plan"),
        "reviewed_at": row.validated_at.isoformat() if row.validated_at else None,
    }


async def save_review(db: AsyncSession, project_id: int, review: dict) -> None:
    """Сохранить последнюю оценку всего проекта."""
    row = await _get_or_create(db, project_id, REVIEW_CARD_ID)
    row.validation_json = review
    row.validated_at = datetime.utcnow()
    await db.commit()


async def save_chat_messages(
    db: AsyncSession, project_id: int, messages: list[dict], *,
    card_id: str | None = None, plan: dict | None = None,
) -> None:
    """Сохранить (обрезанную) историю чата карточки-фокуса и, при наличии, её план."""
    row = await _get_or_create(db, project_id, REVIEW_CARD_ID)
    content = dict(row.content_json) if isinstance(row.content_json, dict) else {}
    chats = dict(content.get("chats") or {})
    entry = dict(chats.get(_chat_key(card_id)) or {})
    entry["messages"] = messages[-_MAX_CHAT_MESSAGES:]
    if plan is not None:
        entry["plan"] = plan
    chats[_chat_key(card_id)] = entry
    content["chats"] = chats
    content.pop("messages", None)  # вычищаем legacy-формат единого чата
    content.pop("plan", None)
    row.content_json = content
    await db.commit()


async def reset_chat(db: AsyncSession, project_id: int, card_id: str | None = None) -> None:
    """Очистить чат и план карточки-фокуса («Новый чат»)."""
    row = (await db.scalars(
        select(ProjectCardState).where(
            ProjectCardState.project_id == project_id,
            ProjectCardState.card_id == REVIEW_CARD_ID,
        )
    )).first()
    if row is None:
        return
    content = dict(row.content_json) if isinstance(row.content_json, dict) else {}
    chats = dict(content.get("chats") or {})
    chats.pop(_chat_key(card_id), None)
    content["chats"] = chats
    content.pop("messages", None)
    content.pop("plan", None)
    row.content_json = content
    await db.commit()
