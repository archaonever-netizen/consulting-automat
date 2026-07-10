"""Схемы контента публичного лендинга.

Тело — произвольный JSON-объект (его форму держит фронт, см.
frontend/src/landing/content.ts). Бэкенд не валидирует структуру, только то,
что это объект.
"""
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel


class LandingContentRead(BaseModel):
    data: Optional[dict[str, Any]] = None
    updated_at: Optional[datetime] = None


class LandingContentUpdate(BaseModel):
    data: dict[str, Any]
