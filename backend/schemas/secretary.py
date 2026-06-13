from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class LocalSecretaryMessage(BaseModel):
    text: str = Field(min_length=1)
    user_email: str | None = None


class TelegramSendMessage(BaseModel):
    text: str = Field(min_length=1)
    chat_id: int | None = None


class SecretaryAction(BaseModel):
    type: Literal["help", "create_task", "list_tasks", "send_telegram", "create_chat", "unknown"]
    title: str | None = None
    task_id: int | None = None
    message_text: str | None = None
    subchat_id: int | None = None
    telegram_chat_id: int | None = None
    telegram_user_id: int | None = None
    telegram_username: str | None = None
    telegram_full_name: str | None = None


class SecretaryTaskCard(BaseModel):
    id: int
    title: str
    start_time: datetime | None = None
    duration_minutes: int | None = None
    preparation_notes: str | None = None


class SecretaryResponse(BaseModel):
    text: str
    action: SecretaryAction
    created_at: datetime
    tasks: list[SecretaryTaskCard] = Field(default_factory=list)
