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


class KnowledgeSourceLayerRead(BaseModel):
    id: int
    layer_type: str
    title: str
    content: str
    content_origin: str
    sort_order: int

    model_config = {"from_attributes": True}


class KnowledgeSourceSummaryRead(BaseModel):
    id: int
    key: str
    title: str
    source_type: str
    version: Optional[str]
    language: str
    source_file: str
    source_url: Optional[str]
    processing_status: str
    added_at: datetime
    processed_at: Optional[datetime]
    layers: List[KnowledgeSourceLayerRead] = []

    model_config = {"from_attributes": True}


class KnowledgeSourceTextRead(BaseModel):
    id: int
    text: str
    text_origin: str
    extraction_method: str

    model_config = {"from_attributes": True}


class KnowledgeSourceFragmentRead(BaseModel):
    id: int
    title: str
    full_text: str
    summary: Optional[str]
    summary_origin: str
    text_origin: str
    sort_order: int
    outline_level: int
    page_start: Optional[int]
    page_end: Optional[int]
    source_ref: str
    metadata_json: Optional[dict]

    model_config = {"from_attributes": True}


class KnowledgeSectionSourceLinkRead(BaseModel):
    relation_type: str
    sort_order: int
    source: KnowledgeSourceSummaryRead

    model_config = {"from_attributes": True}


class KnowledgeSectionRead(BaseModel):
    id: int
    key: str
    title: str
    description: Optional[str]
    section_type: str
    sort_order: int
    children: List["KnowledgeSectionRead"] = []
    source_links: List[KnowledgeSectionSourceLinkRead] = []

    model_config = {"from_attributes": True}


class KnowledgeSourceDetailRead(KnowledgeSourceSummaryRead):
    texts: List[KnowledgeSourceTextRead] = []
    fragments: List[KnowledgeSourceFragmentRead] = []
