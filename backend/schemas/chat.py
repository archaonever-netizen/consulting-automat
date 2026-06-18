from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class ChatMessageRead(BaseModel):
    id: int
    subchat_id: int
    role: str
    content: str
    tokens: int
    created_at: datetime

    model_config = {"from_attributes": True}


class SubChatCreate(BaseModel):
    task_id: Optional[int] = None


class TelegramChatCreate(BaseModel):
    telegram_chat_id: int
    telegram_user_id: Optional[int] = None
    telegram_username: Optional[str] = None
    telegram_full_name: Optional[str] = None


class SubChatRead(BaseModel):
    id: int
    session_id: int
    task_id: Optional[int] = None
    title: Optional[str] = None
    source: str = "app"
    telegram_chat_id: Optional[int] = None
    telegram_user_id: Optional[int] = None
    telegram_username: Optional[str] = None
    telegram_full_name: Optional[str] = None
    version: int
    tokens_used: int
    created_at: datetime
    messages: list[ChatMessageRead] = []

    model_config = {"from_attributes": True}


class ChatSessionRead(BaseModel):
    id: int
    user_id: int
    title: str
    created_at: datetime
    subchats: list[SubChatRead] = []

    model_config = {"from_attributes": True}


class SendMessageRequest(BaseModel):
    content: str
