from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError

from ..core.database import get_db
from ..routes.auth import get_current_user_dep
from ..services import knowledge as kb
from ..schemas.knowledge import (
    ArticleCreate, ArticleUpdate, ArticleRead,
    CategoryCreate, CategoryUpdate, CategoryRead, CategoryWithArticles,
)

router = APIRouter()


async def require_founder(current_user=Depends(get_current_user_dep)):
    """Только основатель может редактировать Базу знаний."""
    if not current_user.is_founder:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Редактировать Базу знаний может только основатель",
        )
    return current_user


# ── Чтение (все авторизованные) ─────────────────────────────
@router.get("", response_model=list[CategoryWithArticles])
async def get_knowledge(
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    """Дерево Базы знаний: разделы с опубликованными статьями."""
    is_founder = bool(getattr(current_user, "is_founder", False))
    # Основатель видит и черновики (для редактирования), остальные — только опубликованное.
    return await kb.list_tree(db, published_only=not is_founder)


# ── Разделы (только основатель) ─────────────────────────────
@router.post("/categories", response_model=CategoryRead, status_code=status.HTTP_201_CREATED)
async def create_category(
    data: CategoryCreate,
    _=Depends(require_founder),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await kb.create_category(db, **data.model_dump())
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Раздел с таким ключом уже существует")


@router.patch("/categories/{category_id}", response_model=CategoryRead)
async def update_category(
    category_id: int,
    data: CategoryUpdate,
    _=Depends(require_founder),
    db: AsyncSession = Depends(get_db),
):
    cat = await kb.update_category(db, category_id, data.model_dump(exclude_unset=True))
    if cat is None:
        raise HTTPException(status_code=404, detail="Раздел не найден")
    return cat


@router.delete("/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category(
    category_id: int,
    _=Depends(require_founder),
    db: AsyncSession = Depends(get_db),
):
    if not await kb.delete_category(db, category_id):
        raise HTTPException(status_code=404, detail="Раздел не найден")


# ── Статьи (только основатель) ──────────────────────────────
@router.post("/articles", response_model=ArticleRead, status_code=status.HTTP_201_CREATED)
async def create_article(
    data: ArticleCreate,
    user=Depends(require_founder),
    db: AsyncSession = Depends(get_db),
):
    return await kb.create_article(db, created_by_id=user.id, **data.model_dump())


@router.patch("/articles/{article_id}", response_model=ArticleRead)
async def update_article(
    article_id: int,
    data: ArticleUpdate,
    _=Depends(require_founder),
    db: AsyncSession = Depends(get_db),
):
    art = await kb.update_article(db, article_id, data.model_dump(exclude_unset=True))
    if art is None:
        raise HTTPException(status_code=404, detail="Статья не найдена")
    return art


@router.delete("/articles/{article_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_article(
    article_id: int,
    _=Depends(require_founder),
    db: AsyncSession = Depends(get_db),
):
    if not await kb.delete_article(db, article_id):
        raise HTTPException(status_code=404, detail="Статья не найдена")
