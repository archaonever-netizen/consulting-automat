"""API декомпозиции целей (фаза 4).

Тонкий слой: загрузка/сохранение GoalDocument (JSON) + вызов сервиса и движка.
Вся доменная логика — в services/goal_decomposition. Каждый эндпоинт под
аутентификацией; доступ ограничен владельцем (owner_id).
"""
import uuid
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import get_settings
from ..core.database import get_db
from ..models import GoalDocument as GoalDocumentRow
from ..routes.auth import get_current_user_dep
from ..schemas.goals import (
    AlternativesRequest,
    ApproveRequest,
    ConfirmAssumptionRequest,
    CreateGoalRequest,
    DatasetUpdateRequest,
    DecomposeRequest,
    EditRequest,
    RecalculateRequest,
    RejectRequest,
)
from ..services.goal_decomposition import service
from ..services.goal_decomposition.domain import (
    Actor,
    ActorKind,
    AssumptionStatus,
    Goal,
    GoalDecompositionDocument,
    PeriodLevel,
)
from ..services.goal_decomposition.engine import Proposal, decompose
from ..services.goal_decomposition.service import (
    AssumptionNotFound,
    DecomposeNotAllowed,
    MetricEdit,
    PeriodNotFound,
)
from ..services.goal_decomposition.state_machine import InvalidTransition, child_level

router = APIRouter()


# ─────────────────────────── вспомогательное ───────────────────────────

async def _load_row(goal_id: str, user: Any, db: AsyncSession) -> GoalDocumentRow:
    res = await db.execute(select(GoalDocumentRow).where(GoalDocumentRow.goal_id == goal_id))
    row = res.scalar_one_or_none()
    if row is None or (row.owner_id is not None and row.owner_id != user.id):
        raise HTTPException(status_code=404, detail="Цель не найдена")
    return row


def _doc(row: GoalDocumentRow) -> GoalDecompositionDocument:
    return GoalDecompositionDocument.from_storage(row.document)


async def _persist(row: GoalDocumentRow, doc: GoalDecompositionDocument, db: AsyncSession) -> None:
    row.document = doc.to_storage()
    row.status = doc.goal.status.value
    await db.commit()


def _actor_human(user: Any) -> Actor:
    return Actor(kind=ActorKind.HUMAN, ref=f"user:{user.id}")


def _actor_ai() -> Actor:
    return Actor(kind=ActorKind.AI, ref=f"ai:decomposition@{get_settings().decomposition_model}")


def _existing_assumptions(doc: GoalDecompositionDocument) -> list[dict[str, Any]]:
    """Подтверждённые/отклонённые допущения — контекст для движка."""
    pools = [doc.goal.assumptions, *[p.assumptions for p in doc.periods]]
    decided = {AssumptionStatus.CONFIRMED, AssumptionStatus.REJECTED}
    return [
        a.model_dump(by_alias=True)
        for pool in pools for a in pool if a.status in decided
    ]


def _parent_node(
    doc: GoalDecompositionDocument, parent_id: Optional[str], goal_dict: dict[str, Any]
) -> dict[str, Any]:
    if parent_id is None:
        return goal_dict
    for p in doc.periods:
        if p.id == parent_id:
            return p.model_dump(by_alias=True)
    raise HTTPException(status_code=404, detail=f"Период '{parent_id}' не найден")


def _proposal_response(p: Proposal) -> dict[str, Any]:
    return {
        "status": p.status,
        "level": p.level,
        "children": p.children,
        "assumptions": p.assumptions,
        "dataGaps": p.data_gaps,
        "alternatives": p.alternatives,
        "notes": p.notes,
        "attempts": p.attempts,
        "error": p.error,
    }


async def _run_engine(
    doc: GoalDecompositionDocument,
    row: GoalDocumentRow,
    level: str,
    parent_id: Optional[str],
    request: str,
    alternatives_count: int,
) -> Proposal:
    goal_dict = doc.goal.model_dump(by_alias=True)
    return await decompose(
        level=level,
        goal=goal_dict,
        parent_node=_parent_node(doc, parent_id, goal_dict),
        dataset=row.dataset or {},
        constraints=goal_dict.get("constraints", []),
        existing_assumptions=_existing_assumptions(doc),
        request=request,
        alternatives_count=alternatives_count,
    )


# ─────────────────────────── создание / чтение ───────────────────────────

@router.post("", status_code=201)
async def create_goal(
    req: CreateGoalRequest,
    user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    goal_id = str(uuid.uuid4())
    payload = {
        "id": goal_id,
        "title": req.title,
        "description": req.description,
        "context": req.context,
        "startDate": req.start_date,
        "deadline": req.deadline,
        "targetMetrics": req.target_metrics,
        "constraints": req.constraints,
        "status": "draft",
    }
    try:
        goal = Goal.model_validate(payload)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors()) from exc
    doc = service.create_goal_document(goal, _actor_human(user))
    row = GoalDocumentRow(
        goal_id=goal_id, owner_id=user.id, title=req.title, status="draft",
        schema_version="1.0.0", document=doc.to_storage(), dataset=req.dataset,
    )
    db.add(row)
    await db.commit()
    return {"goalId": goal_id, "document": doc.to_storage()}


@router.get("")
async def list_goals(
    user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(select(GoalDocumentRow).where(GoalDocumentRow.owner_id == user.id))
    rows = res.scalars().all()
    return [
        {"goalId": r.goal_id, "title": r.title, "status": r.status,
         "updatedAt": r.updated_at.isoformat() if r.updated_at else None}
        for r in rows
    ]


@router.get("/{goal_id}")
async def get_goal(
    goal_id: str,
    user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    row = await _load_row(goal_id, user, db)
    return {"goalId": row.goal_id, "document": row.document, "dataset": row.dataset or {}}


@router.get("/{goal_id}/changelog")
async def get_changelog(
    goal_id: str,
    user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    row = await _load_row(goal_id, user, db)
    return {"changeLog": (row.document or {}).get("changeLog", [])}


@router.post("/{goal_id}/dataset")
async def update_dataset(
    goal_id: str,
    req: DatasetUpdateRequest,
    user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    row = await _load_row(goal_id, user, db)
    merged = {**(row.dataset or {}), **req.dataset}
    row.dataset = merged
    await db.commit()
    return {"dataset": merged}


# ─────────────────────────── декомпозиция / альтернативы ───────────────────────────

@router.post("/{goal_id}/decompose")
async def decompose_level(
    goal_id: str,
    req: DecomposeRequest,
    user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    row = await _load_row(goal_id, user, db)
    doc = _doc(row)
    try:
        level = PeriodLevel(req.level)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="level ∈ {MONTH, WEEK, DAY}") from exc
    try:
        service.ensure_can_decompose(doc, req.parent_id)
    except DecomposeNotAllowed as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except PeriodNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    proposal = await _run_engine(doc, row, req.level, req.parent_id, "decompose", 0)

    if proposal.status == "proposed":
        service.attach_decomposition(doc, proposal, level, req.parent_id, _actor_ai())
        await _persist(row, doc, db)
    elif proposal.status == "blocked":
        service.merge_proposal_context(doc, proposal, req.parent_id)
        await _persist(row, doc, db)
    return _proposal_response(proposal)


@router.post("/{goal_id}/alternatives")
async def alternatives(
    goal_id: str,
    req: AlternativesRequest,
    user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    row = await _load_row(goal_id, user, db)
    doc = _doc(row)
    proposal = await _run_engine(doc, row, req.level, req.parent_id, "alternatives", req.count)
    return _proposal_response(proposal)


@router.post("/{goal_id}/recalculate")
async def recalculate(
    goal_id: str,
    req: RecalculateRequest,
    user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    row = await _load_row(goal_id, user, db)
    doc = _doc(row)
    parent_level = None
    if req.parent_id is not None:
        parent = next((p for p in doc.periods if p.id == req.parent_id), None)
        if parent is None:
            raise HTTPException(status_code=404, detail=f"Период '{req.parent_id}' не найден")
        parent_level = parent.level
    level = child_level(parent_level)

    proposal = await _run_engine(doc, row, level.value, req.parent_id, "decompose", 0)
    if proposal.status != "proposed":
        return _proposal_response(proposal)

    doc, diffs = service.recalculate(doc, req.parent_id, proposal, _actor_ai())
    await _persist(row, doc, db)
    return {
        "diffs": [
            {"periodId": d.period_id, "metricId": d.metric_id, "field": d.field,
             "oldValue": d.old_value, "newValue": d.new_value, "preserved": d.preserved}
            for d in diffs
        ],
        "document": doc.to_storage(),
    }


# ─────────────────────────── согласование узла ───────────────────────────

@router.post("/{goal_id}/periods/{period_id}/approve")
async def approve(
    goal_id: str,
    period_id: str,
    req: ApproveRequest,
    user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    row = await _load_row(goal_id, user, db)
    doc = _doc(row)
    try:
        service.approve_period(doc, period_id, req.reviewed_by, req.comment, _actor_human(user))
    except PeriodNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except InvalidTransition as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    await _persist(row, doc, db)
    return {"document": doc.to_storage()}


@router.post("/{goal_id}/periods/{period_id}/reject")
async def reject(
    goal_id: str,
    period_id: str,
    req: RejectRequest,
    user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    row = await _load_row(goal_id, user, db)
    doc = _doc(row)
    try:
        service.reject_period(doc, period_id, req.reviewed_by, req.reason, _actor_human(user))
    except PeriodNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except InvalidTransition as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await _persist(row, doc, db)
    return {"document": doc.to_storage()}


@router.post("/{goal_id}/periods/{period_id}/edit")
async def edit(
    goal_id: str,
    period_id: str,
    req: EditRequest,
    user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    row = await _load_row(goal_id, user, db)
    doc = _doc(row)
    edits = [MetricEdit(metric_id=e.metric_id, target_value=e.target_value) for e in req.edits]
    try:
        service.edit_period(doc, period_id, edits, _actor_human(user))
    except PeriodNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except InvalidTransition as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    await _persist(row, doc, db)
    return {"document": doc.to_storage()}


@router.post("/{goal_id}/assumptions/{assumption_id}/confirm")
async def confirm_assumption(
    goal_id: str,
    assumption_id: str,
    req: ConfirmAssumptionRequest,
    user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    row = await _load_row(goal_id, user, db)
    doc = _doc(row)
    try:
        st = AssumptionStatus(req.status)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="status ∈ {confirmed, rejected}") from exc
    try:
        doc, impacted = service.confirm_assumption(
            doc, assumption_id, st, req.actual_value, _actor_human(user)
        )
    except AssumptionNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    await _persist(row, doc, db)
    return {"impacted": impacted, "document": doc.to_storage()}
