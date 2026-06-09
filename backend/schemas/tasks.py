from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class TaskCreate(BaseModel):
    title: str
    client_id: int
    assigned_to_id: Optional[int] = None
    start_time: Optional[datetime] = None
    duration_minutes: Optional[int] = None
    input_data: Optional[str] = None
    goal: Optional[str] = None
    action_description: Optional[str] = None
    expected_result: Optional[str] = None


class TaskUpdate(BaseModel):
    field: str
    value: str | int | None


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
    status: str
    start_time: Optional[datetime]
    duration_minutes: Optional[int]
    created_at: datetime

    model_config = {"from_attributes": True}
