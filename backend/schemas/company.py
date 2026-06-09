from pydantic import BaseModel
from typing import Optional


class DepartmentCreate(BaseModel):
    name: str
    description: Optional[str] = None


class FunctionUpdate(BaseModel):
    description: Optional[str] = None


class LinkCreate(BaseModel):
    function_id: int
    department_id: int
    relation_type: str
    description: Optional[str] = None


class FunctionRead(BaseModel):
    id: int
    name: str
    description: Optional[str]

    model_config = {"from_attributes": True}


class DepartmentRead(BaseModel):
    id: int
    name: str
    description: Optional[str]

    model_config = {"from_attributes": True}
