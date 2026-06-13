from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class TaskCreate(BaseModel):
    title: str
    client_id: int
    assigned_to_id: Optional[int] = None
    start_time: Optional[datetime] = None
    duration_minutes: Optional[int] = None
    input_data: Optional[str] = None
    preparation_notes: Optional[str] = None
    goal: Optional[str] = None
    action_description: Optional[str] = None
    expected_result: Optional[str] = None


class TaskUpdate(BaseModel):
    """Частичное обновление: переданы — меняем, не переданы — не трогаем."""
    title: Optional[str] = None
    client_id: Optional[int] = None
    assigned_to_id: Optional[int] = None
    start_time: Optional[datetime] = None
    duration_minutes: Optional[int] = None
    input_data: Optional[str] = None
    preparation_notes: Optional[str] = None
    goal: Optional[str] = None
    action_description: Optional[str] = None
    expected_result: Optional[str] = None


class TaskComplete(BaseModel):
    actual_result: Optional[str] = None
    is_failure: bool = False
    difficulties: Optional[str] = None
    how_overcome: Optional[str] = None
    next_step: Optional[str] = None


class TaskRead(BaseModel):
    id: int
    title: str
    client_id: int
    assigned_to_id: Optional[int] = None
    status: str
    start_time: Optional[datetime]
    duration_minutes: Optional[int]
    input_data: Optional[str] = None
    preparation_notes: Optional[str] = None
    goal: Optional[str] = None
    action_description: Optional[str] = None
    expected_result: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}
