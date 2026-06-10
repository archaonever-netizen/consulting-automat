from pydantic import BaseModel
from typing import Optional, List


class ContentItem(BaseModel):
    """Пункт содержимого карточки (фреймворк, фича, регламент и т.п.)."""
    title: str
    note: Optional[str] = None


class DepartmentCreate(BaseModel):
    name: str
    description: Optional[str] = None


class LinkCreate(BaseModel):
    function_id: int
    department_id: int
    relation_type: str  # executor | consumer | supplier
    description: Optional[str] = None


class FunctionUpdate(BaseModel):
    """Частичное обновление функции. Любое поле опционально."""
    description: Optional[str] = None
    frameworks: Optional[List[ContentItem]] = None
    skills: Optional[List[ContentItem]] = None
    features: Optional[List[ContentItem]] = None
    databases: Optional[List[ContentItem]] = None
    product: Optional[str] = None


class DepartmentUpdate(BaseModel):
    """Частичное обновление отдела. Любое поле опционально."""
    description: Optional[str] = None
    ai_employees: Optional[List[ContentItem]] = None
    employees: Optional[List[ContentItem]] = None
    regulations: Optional[List[ContentItem]] = None
    instructions: Optional[List[ContentItem]] = None
    frameworks: Optional[List[ContentItem]] = None


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
