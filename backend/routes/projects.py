from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.database import get_db
from ..routes._ratelimit import rate_limit
from ..routes.auth import get_current_user_dep
from ..schemas.projects import (
    CardContentUpsert,
    CardValidateRequest,
    ProjectChatRequest,
    ProjectCompositionRequest,
    ProjectCreate,
    ProjectReviewRequest,
    ProjectUpdate,
)
from ..services import (
    bots,
    card_validator,
    project_cards,
    project_methodolog,
    projects as project_service,
)

router = APIRouter()


@router.get("/{project_id}/cards")
async def list_project_cards(
    project_id: int,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    """Состояния всех карточек проекта (содержимое + последняя валидация) для гидрации UI."""
    if not await project_cards.project_exists(db, project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    return await project_cards.list_cards(db, project_id)


@router.put("/{project_id}/cards/{card_id}")
async def save_project_card(
    project_id: int,
    card_id: str,
    data: CardContentUpsert,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    """Сохранить введённое содержимое карточки (данные из полей/строк)."""
    if not await project_cards.project_exists(db, project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    return await project_cards.upsert_content(db, project_id, card_id, data.content)


@router.post(
    "/{project_id}/cards/{card_id}/validate",
    dependencies=[Depends(rate_limit("card_validate", 15))],
)
async def validate_card(
    project_id: int,
    card_id: str,
    data: CardValidateRequest,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    """Проверить заполнение карточки строго по методологиям из RAG и сохранить результат.

    Платный ИИ-вызов (гибридный поиск + модель), поэтому per-user rate limit.
    Гибридный поиск требует Postgres/pgvector → на dev SQLite ожидаемый 503.
    """
    if not await project_cards.project_exists(db, project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    if not data.content:
        raise HTTPException(status_code=400, detail="Карточка не заполнена")
    try:
        result = await card_validator.validate_card(data.card_title, data.content)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    # Сохраняем в БД компактную выжимку (без сырого raw/usage), пригодную для гидрации UI.
    validation = {
        "answer": result["answer"],
        "verdict": result["verdict"],
        "evidence": result["evidence"],
        "contentHash": data.content_hash or "",
        "checkedAt": datetime.now(timezone.utc).isoformat(),
    }
    await project_cards.save_validation(db, project_id, card_id, validation)
    return validation


@router.get("/{project_id}/review")
async def get_project_review(
    project_id: int,
    card_id: str | None = Query(default=None),
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    """Сохранённая оценка проекта (общая) и чат/план карточки-фокуса (для гидрации панели)."""
    if not await project_cards.project_exists(db, project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    return await project_cards.get_review(db, project_id, card_id)


@router.post(
    "/{project_id}/review",
    dependencies=[Depends(rate_limit("project_review", 5))],
)
async def review_project(
    project_id: int,
    data: ProjectReviewRequest,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    """Полная оценка всего проекта светофором R/A/G строго по методологиям из RAG.

    Платный ИИ-вызов (гибридный поиск + модель) → per-user rate limit.
    Гибридный поиск требует Postgres/pgvector → на dev SQLite ожидаемый 503.
    """
    if not await project_cards.project_exists(db, project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    sections = [s.model_dump() for s in data.sections]
    model = await bots.get_methodolog_model(db)
    try:
        result = await project_methodolog.review_project(data.full_text, sections, model=model)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    review = {
        "answer": result["answer"],
        "overall": result["overall"],
        "summary": result["summary"],
        "sections": result["sections"],
        "evidence": result["evidence"],
        "has_support": result["has_support"],
        "checkedAt": datetime.now(timezone.utc).isoformat(),
    }
    await project_cards.save_review(db, project_id, review)
    return review


@router.post(
    "/{project_id}/composition",
    dependencies=[Depends(rate_limit("project_composition", 10))],
)
async def compose_project(
    project_id: int,
    data: ProjectCompositionRequest,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    """Read-only композиция выбранного раздела без RAG, оценки и правок."""
    if not await project_cards.project_exists(db, project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    model = await bots.get_methodolog_model(db)
    try:
        result = await project_methodolog.compose_project(data.project_model, model=model)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"manifest": result["manifest"], "composition": result["composition"]}


@router.post(
    "/{project_id}/review/chat",
    dependencies=[Depends(rate_limit("project_chat", 30))],
)
async def review_chat(
    project_id: int,
    data: ProjectChatRequest,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    """Диалог-уточнение с Методологом: ответ + предложения правок (без самостоятельного применения)."""
    if not await project_cards.project_exists(db, project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    history = [m.model_dump() for m in data.history]
    strong_model = await bots.get_methodolog_model(db)
    try:
        result = await project_methodolog.chat_methodolog(
            data.message,
            history=history,
            project_model=data.project_model,
            review=data.review,
            strong_model=strong_model,
            focus_card_id=data.focus_card_id,
            deep=data.deep,
            mode=data.mode or "fill",
            plan=data.plan,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    # Согласованный план для персиста: в фазе планирования берём свежие вопросы из ответа
    # (ответы пользователя — из присланного плана); иначе сохраняем план как есть.
    if (data.mode or "fill") == "plan":
        saved_plan = {
            "card_id": data.focus_card_id,
            "text": result["reply"],
            "questions": result.get("questions") or [],
            "answers": (data.plan or {}).get("answers") or [],
        }
    else:
        saved_plan = data.plan

    # История чата = прошлые сообщения + (сообщение пользователя, если не quiet) + ответ методолога.
    # quiet — действие кнопки: не сохраняем user-сообщение, чтобы не засорять переписку.
    new_turns: list[dict] = []
    if not data.quiet:
        new_turns.append({"role": "user", "content": data.message})
    new_turns.append({"role": "assistant", "content": result["reply"]})
    messages = history + new_turns
    await project_cards.save_chat_messages(
        db, project_id, messages, card_id=data.focus_card_id, plan=saved_plan,
    )
    return {
        "reply": result["reply"],
        "proposals": result["proposals"],
        "questions": result.get("questions") or [],
        "evidence": result["evidence"],
    }


@router.post("/{project_id}/review/chat/reset")
async def reset_review_chat(
    project_id: int,
    card_id: str | None = Query(default=None),
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    """«Новый чат»: очистить чат и план карточки-фокуса."""
    if not await project_cards.project_exists(db, project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    await project_cards.reset_chat(db, project_id, card_id)
    return {"ok": True}


@router.get("")
async def list_projects(
    client_id: int | None = Query(default=None),
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    return await project_service.list_projects(db, client_id=client_id)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_project(
    data: ProjectCreate,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    project = await project_service.create_project(db, data)
    if project is None:
        raise HTTPException(status_code=404, detail="Client not found")
    return {"id": project.id, "client_id": project.client_id, "name": project.name}


@router.get("/{project_id}")
async def get_project(
    project_id: int,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    project = await project_service.get_project(db, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.put("/{project_id}")
async def update_project(
    project_id: int,
    data: ProjectUpdate,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    project = await project_service.update_project(db, project_id, data)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"id": project.id, "client_id": project.client_id, "name": project.name}


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: int,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    success = await project_service.delete_project(db, project_id)
    if not success:
        raise HTTPException(status_code=404, detail="Project not found")
