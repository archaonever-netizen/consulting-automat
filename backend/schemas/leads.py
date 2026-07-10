from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator


class LeadCreate(BaseModel):
    """Тело публичной формы заявки с лендинга."""

    name: str = Field(max_length=200)
    contact: str = Field(max_length=255)
    note: Optional[str] = Field(default=None, max_length=4000)
    # Согласие на обработку ПДн (152-ФЗ): факт, время клика и версия политики.
    consent: bool = False
    consent_at: Optional[datetime] = None
    policy_version: Optional[str] = Field(default=None, max_length=40)
    # Страница-источник (для аналитики).
    source: Optional[str] = Field(default=None, max_length=255)
    # Honeypot: скрытое поле, которое заполняют только боты. Реальные
    # пользователи оставляют его пустым.
    website: Optional[str] = None

    @field_validator("name", "contact")
    @classmethod
    def _not_blank(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("Обязательное поле")
        return v


class LeadStatusUpdate(BaseModel):
    status: str


class LeadRead(BaseModel):
    id: int
    name: str
    contact: str
    note: Optional[str]
    status: str
    consent: bool
    consent_at: Optional[datetime]
    policy_version: Optional[str]
    source: Optional[str]
    created_at: Optional[datetime]

    model_config = {"from_attributes": True}
