from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, field_validator

# Ключи разделов клиентского портала (скелет — будет дорабатываться на Этапе 2).
# Метки (русские названия) живут на фронте; бэкенд хранит и валидирует ключи.
PORTAL_SECTIONS = ['project', 'stages', 'status', 'documents', 'events', 'info']


def _clean_sections(value: Optional[List[str]]) -> List[str]:
    """Оставить только известные ключи разделов, без дублей, в каноничном порядке."""
    if not value:
        return []
    chosen = {s for s in value if s in PORTAL_SECTIONS}
    return [s for s in PORTAL_SECTIONS if s in chosen]


class PortalUserCreate(BaseModel):
    full_name: str
    email: str
    password: str
    role: Optional[str] = ''
    sections: List[str] = []

    @field_validator('full_name')
    @classmethod
    def name_required(cls, value: str) -> str:
        value = (value or '').strip()
        if not value:
            raise ValueError('Имя сотрудника обязательно')
        return value

    @field_validator('email')
    @classmethod
    def email_required(cls, value: str) -> str:
        value = (value or '').strip().lower()
        if '@' not in value or '.' not in value:
            raise ValueError('Укажите корректный email')
        return value

    @field_validator('password')
    @classmethod
    def password_required(cls, value: str) -> str:
        value = value or ''
        if len(value) < 6:
            raise ValueError('Пароль не короче 6 символов')
        return value

    @field_validator('role')
    @classmethod
    def clean_role(cls, value: Optional[str]) -> str:
        return (value or '').strip()

    @field_validator('sections')
    @classmethod
    def validate_sections(cls, value: List[str]) -> List[str]:
        return _clean_sections(value)


class PortalUserUpdate(BaseModel):
    """Любое поле опционально. `password` задан — пароль переустанавливается."""
    full_name: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = None
    sections: Optional[List[str]] = None
    is_active: Optional[bool] = None

    @field_validator('full_name')
    @classmethod
    def clean_name(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError('Имя сотрудника обязательно')
        return value

    @field_validator('email')
    @classmethod
    def clean_email(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        value = value.strip().lower()
        if '@' not in value or '.' not in value:
            raise ValueError('Укажите корректный email')
        return value

    @field_validator('password')
    @classmethod
    def clean_password(cls, value: Optional[str]) -> Optional[str]:
        if value is None or value == '':
            return None
        if len(value) < 6:
            raise ValueError('Пароль не короче 6 символов')
        return value

    @field_validator('role')
    @classmethod
    def clean_role(cls, value: Optional[str]) -> Optional[str]:
        return value.strip() if value is not None else None

    @field_validator('sections')
    @classmethod
    def validate_sections(cls, value: Optional[List[str]]) -> Optional[List[str]]:
        return _clean_sections(value) if value is not None else None


class PortalUserRead(BaseModel):
    id: int
    client_id: int
    full_name: str
    email: str
    role: str
    sections: List[str] = []
    is_active: bool
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
