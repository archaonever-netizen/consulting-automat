from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class ClientCreate(BaseModel):
    name: str


class ClientUpdate(BaseModel):
    name: str


class BriefStateSchema(BaseModel):
    id: int
    brief_type: str
    status: str
    updated_at: Optional[datetime]

    model_config = {"from_attributes": True}


class ClientRead(BaseModel):
    id: int
    name: str
    created_at: Optional[datetime]
    briefs: list[BriefStateSchema] = []

    model_config = {"from_attributes": True}


class ClientListItem(BaseModel):
    id: int
    name: str
    created_at: Optional[datetime]
    initials: str
    color: str
    done: int
    total: int
    health: int
    health_label: str
    health_cls: str
    ring_filled: float
    ring_empty: float
    bd_briefing: str
    bd_point_a: str
    bd_docs: str
