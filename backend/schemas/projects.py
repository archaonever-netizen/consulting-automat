from datetime import datetime
from typing import Optional

from pydantic import BaseModel, field_validator


class ProjectCreate(BaseModel):
    client_id: int
    name: str
    description: Optional[str] = None

    @field_validator("name")
    @classmethod
    def name_required(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Project name is required")
        return value

    @field_validator("description")
    @classmethod
    def clean_description(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        value = value.strip()
        return value or None


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("Project name is required")
        return value

    @field_validator("description")
    @classmethod
    def clean_description(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        value = value.strip()
        return value or None


class CardValidateRequest(BaseModel):
    card_id: str
    card_title: str
    content: str

    @field_validator("content", "card_title")
    @classmethod
    def strip_text(cls, value: str) -> str:
        return (value or "").strip()


class ProjectRead(BaseModel):
    id: int
    client_id: int
    client_name: str
    name: str
    description: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    created_at_fmt: str
    updated_at_fmt: str

    model_config = {"from_attributes": True}
