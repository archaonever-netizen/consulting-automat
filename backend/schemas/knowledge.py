from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


# ── Статьи ──────────────────────────────────────────────────
class ArticleCreate(BaseModel):
    category_id: int
    title: str
    summary: Optional[str] = None
    body: Optional[str] = None
    icon_key: Optional[str] = None
    route: Optional[str] = None
    tags: Optional[List[str]] = None
    sort_order: int = 0
    is_published: bool = True
    ai_visible: bool = True


class ArticleUpdate(BaseModel):
    category_id: Optional[int] = None
    title: Optional[str] = None
    summary: Optional[str] = None
    body: Optional[str] = None
    icon_key: Optional[str] = None
    route: Optional[str] = None
    tags: Optional[List[str]] = None
    sort_order: Optional[int] = None
    is_published: Optional[bool] = None
    ai_visible: Optional[bool] = None


class ArticleRead(BaseModel):
    id: int
    category_id: int
    title: str
    summary: Optional[str]
    body: Optional[str]
    icon_key: Optional[str]
    route: Optional[str]
    tags: Optional[List[str]]
    sort_order: int
    is_published: bool
    ai_visible: bool
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Разделы ─────────────────────────────────────────────────
class CategoryCreate(BaseModel):
    key: str
    title: str
    description: Optional[str] = None
    icon_key: Optional[str] = None
    layout: str = "cards"
    sort_order: int = 0


class CategoryUpdate(BaseModel):
    key: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    icon_key: Optional[str] = None
    layout: Optional[str] = None
    sort_order: Optional[int] = None


class CategoryRead(BaseModel):
    id: int
    key: str
    title: str
    description: Optional[str]
    icon_key: Optional[str]
    layout: str
    sort_order: int

    model_config = {"from_attributes": True}


class CategoryWithArticles(CategoryRead):
    articles: List[ArticleRead] = []
