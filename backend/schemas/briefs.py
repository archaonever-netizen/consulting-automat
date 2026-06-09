from pydantic import BaseModel
from datetime import datetime
from typing import Optional, Any


class BriefCreate(BaseModel):
    brief_type: str
    client_id: int


class BriefUpdate(BaseModel):
    answers: Optional[dict[str, Any]] = None
    status: Optional[str] = None


class BriefSectionRead(BaseModel):
    id: int
    section_name: str
    section_order: Optional[int]
    data: Optional[Any]
    ai_summary: Optional[str]

    model_config = {"from_attributes": True}


class BriefRead(BaseModel):
    id: int
    brief_type: str
    status: str
    client_id: int
    created_at: Optional[datetime]
    updated_at: Optional[datetime]
    sections: list[BriefSectionRead] = []

    model_config = {"from_attributes": True}
