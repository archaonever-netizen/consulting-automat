from typing import Optional

from pydantic import BaseModel


class KaitenConnectRequest(BaseModel):
    domain: str
    token: str


class KaitenConnectionRead(BaseModel):
    connected: bool
    domain: Optional[str] = None
    kaiten_user_name: Optional[str] = None
    kaiten_email: Optional[str] = None


class CardCreate(BaseModel):
    board_id: int
    column_id: int
    title: str
    lane_id: Optional[int] = None
    description: Optional[str] = None
    due_date: Optional[str] = None


class CardUpdate(BaseModel):
    column_id: Optional[int] = None
    lane_id: Optional[int] = None
    sort_order: Optional[float] = None
    title: Optional[str] = None
    description: Optional[str] = None
    due_date: Optional[str] = None


class MemberRequest(BaseModel):
    user_id: int
