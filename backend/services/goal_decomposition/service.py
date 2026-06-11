"""Операции над документом декомпозиции (фаза 4).

Чистый доменный слой между движком/верификатором и хранилищем: создаёт цель,
вшивает предложение ИИ в дерево, проводит согласование по автомату, правки
человека, подтверждение допущений и каскадный пересчёт. Каждая мутация пишется
в changeLog с актором, временем и причиной.

Без БД и сети: на вход — доменные модели и engine.Proposal, на выход —
обновлённый GoalDecompositionDocument. Персистентность (загрузка/сохранение
JSON) и вызов LLM делаются в роутах (routes/goals.py).
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Optional

from .domain import (
    Actor,
    ApprovalStatus,
    Assumption,
    AssumptionStatus,
    ChangeAction,
    ChangeLogEntry,
    DataGap,
    Goal,
    GoalDecompositionDocument,
    Period,
    PeriodLevel,
    ProposedBy,
    Source,
)
from .engine import Proposal
from .recalc import MetricDiff, cascade_mark_needs_revision, merge_children
from .state_machine import (
    Action,
    can_decompose_children,
    child_level,
    next_status,
)


class PeriodNotFound(Exception):
    pass


class AssumptionNotFound(Exception):
    pass


class DecomposeNotAllowed(Exception):
    """Спуск на уровень ниже запрещён: родитель не approved."""


@dataclass
class MetricEdit:
    metric_id: str
    target_value: Optional[float]


# ─────────────────────────── создание / декомпозиция ───────────────────────────

def create_goal_document(goal: Goal, actor: Actor) -> GoalDecompositionDocument:
    """Создать документ из цели (status=draft, пустое дерево)."""
    doc = GoalDecompositionDocument(goal=goal, periods=[], change_log=[])
    _log(doc, actor, f"goal:{goal.id}", ChangeAction.CREATE, reason="Создание цели")
    return doc


def ensure_can_decompose(doc: GoalDecompositionDocument, parent_id: Optional[str]) -> None:
    """Проверить, что спуск разрешён: для периода-родителя нужен approved."""
    if parent_id is None:
        return  # цель → месяцы: корень, всегда можно
    parent = _find_period(doc, parent_id)
    if not can_decompose_children(parent.approval.status):
        raise DecomposeNotAllowed(
            f"Период '{parent_id}' в статусе {parent.approval.status.value}: "
            "спуск на уровень ниже разрешён только из approved"
        )


def attach_decomposition(
    doc: GoalDecompositionDocument,
    proposal: Proposal,
    level: PeriodLevel,
    parent_id: Optional[str],
    actor: Actor,
) -> GoalDecompositionDocument:
    """Вшить proposed-предложение ИИ в дерево как узлы proposed_by_ai."""
    ensure_can_decompose(doc, parent_id)
    periods = proposal_to_periods(
        proposal, level, parent_id, doc.goal.id, _parent_aggregation(doc, parent_id)
    )
    merge_proposal_context(doc, proposal, parent_id)
    doc.periods.extend(periods)
    for p in periods:
        _log(doc, actor, f"period:{p.id}", ChangeAction.CREATE, reason="Предложение ИИ")
    return doc


def proposal_to_periods(
    proposal: Proposal,
    level: PeriodLevel,
    parent_id: Optional[str],
    goal_id: str,
    parent_aggregation: dict[str, str],
) -> list[Period]:
    """Преобразовать children предложения в канонические Period (с валидацией).

    Тип агрегации метрик НАСЛЕДУЕТСЯ от родителя по id; значение из ответа модели
    игнорируется (модель его не выдумывает). Для метрик, которых нет у родителя,
    поле сбрасывается к дефолту (flow) — задать иной тип может только человек.
    """
    periods: list[Period] = []
    for child in proposal.children:
        index = int(child["index"])
        metrics = [dict(m) for m in child.get("allocatedMetrics", [])]
        for m in metrics:
            mid = m.get("id")
            if mid in parent_aggregation:
                m["aggregation"] = parent_aggregation[mid]
            else:
                m.pop("aggregation", None)
        period = Period.model_validate({
            "id": _period_id(level, parent_id, index),
            "level": level.value,
            "index": index,
            "parentId": parent_id,
            "goalId": goal_id,
            "dateRange": child.get("dateRange"),
            "allocatedMetrics": metrics,
            "milestones": child.get("milestones", []),
            "approval": {"status": "proposed_by_ai", "proposedBy": "ai"},
        })
        periods.append(period)
    return periods


def _parent_aggregation(
    doc: GoalDecompositionDocument, parent_id: Optional[str]
) -> dict[str, str]:
    """Карта {metric.id: aggregation} у родителя (цели или периода) для наследования."""
    if parent_id is None:
        metrics = doc.goal.target_metrics
    else:
        metrics = _find_period(doc, parent_id).allocated_metrics
    return {m.id: m.aggregation.value for m in metrics}


# ─────────────────────────── согласование ───────────────────────────

def approve_period(
    doc: GoalDecompositionDocument,
    period_id: str,
    reviewed_by: Optional[str],
    comment: Optional[str],
    actor: Actor,
) -> GoalDecompositionDocument:
    p = _find_period(doc, period_id)
    status = _open_for_decision(p.approval.status)
    p.approval.status = next_status(status, Action.APPROVE)
    p.approval.reviewed_by = reviewed_by
    p.approval.decided_at = _now()
    p.approval.comment = comment
    _log(doc, actor, f"period:{period_id}", ChangeAction.APPROVE, reason=comment)
    return doc


def reject_period(
    doc: GoalDecompositionDocument,
    period_id: str,
    reviewed_by: Optional[str],
    reason: str,
    actor: Actor,
) -> GoalDecompositionDocument:
    if not reason or not reason.strip():
        raise ValueError("Для отклонения обязательна причина (reason)")
    p = _find_period(doc, period_id)
    status = _open_for_decision(p.approval.status)
    p.approval.status = next_status(status, Action.REJECT)
    p.approval.reviewed_by = reviewed_by
    p.approval.decided_at = _now()
    p.approval.comment = reason
    _log(doc, actor, f"period:{period_id}", ChangeAction.REJECT, reason=reason)
    return doc


def edit_period(
    doc: GoalDecompositionDocument,
    period_id: str,
    edits: list[MetricEdit],
    actor: Actor,
) -> GoalDecompositionDocument:
    """Ручная правка метрик: значения становятся source=user_input; узел → needs_revision."""
    p = _find_period(doc, period_id)
    metrics = {m.id: m for m in p.allocated_metrics}
    for edit in edits:
        m = metrics.get(edit.metric_id)
        if m is None:
            raise KeyError(f"Метрика '{edit.metric_id}' не найдена в периоде '{period_id}'")
        old = m.target_value
        m.target_value = edit.target_value
        m.source = Source.USER_INPUT       # человек берёт значение под свою ответственность
        m.derivation = None
        m.assumption_ref = None
        _log(
            doc, actor, f"period:{period_id}", ChangeAction.UPDATE,
            field=f"metric:{edit.metric_id}.targetValue", old=old, new=edit.target_value,
            reason="Ручная правка",
        )
    # перевод узла: из proposed_by_ai сначала открыть, затем edit
    status = p.approval.status
    if status is ApprovalStatus.PROPOSED_BY_AI:
        status = next_status(status, Action.OPEN_REVIEW)
    p.approval.status = next_status(status, Action.EDIT)
    return doc


def confirm_assumption(
    doc: GoalDecompositionDocument,
    assumption_id: str,
    status: AssumptionStatus,
    actual_value: Optional[Any],
    actor: Actor,
) -> tuple[GoalDecompositionDocument, list[str]]:
    """Подтвердить/отклонить допущение. Вернуть approved-узлы, на которые оно влияет."""
    a = _find_assumption(doc, assumption_id)
    old = a.status.value
    a.status = status
    reason = f"actualValue={actual_value}" if actual_value is not None else None
    _log(
        doc, actor, f"assumption:{assumption_id}", ChangeAction.CONFIRM_ASSUMPTION,
        field="status", old=old, new=status.value, reason=reason,
    )
    impacted = [
        p.id for p in doc.periods
        if p.approval.status is ApprovalStatus.APPROVED
        and _references_assumption(p, assumption_id)
    ]
    return doc, impacted


# ─────────────────────────── каскадный пересчёт ───────────────────────────

def recalculate(
    doc: GoalDecompositionDocument,
    parent_id: Optional[str],
    proposal: Proposal,
    actor: Actor,
) -> tuple[GoalDecompositionDocument, list[MetricDiff]]:
    """Пересчитать дочерний уровень узла, сохранив ручные правки; вернуть дифф."""
    level = child_level(_parent_level(doc, parent_id))
    proposed = proposal_to_periods(
        proposal, level, parent_id, doc.goal.id, _parent_aggregation(doc, parent_id)
    )
    existing = [p for p in doc.periods if p.parent_id == parent_id and p.level is level]

    merged, diffs = merge_children(existing, proposed)
    for mp in merged:
        mp.approval.status = ApprovalStatus.NEEDS_REVISION
        mp.approval.proposed_by = ProposedBy.AI

    existing_ids = {p.id for p in existing}
    doc.periods = [p for p in doc.periods if p.id not in existing_ids] + merged

    # глубже по дереву одобренные узлы тоже требуют ревизии
    for mp in merged:
        cascade_mark_needs_revision(doc, mp.id)

    entity = f"goal:{doc.goal.id}" if parent_id is None else f"period:{parent_id}"
    _log(doc, actor, entity, ChangeAction.RECALCULATE, reason="Каскадный пересчёт",
         triggered=True)
    for d in diffs:
        _log(
            doc, actor, f"period:{d.period_id}", ChangeAction.UPDATE,
            field=f"metric:{d.metric_id}.{d.field}", old=d.old_value, new=d.new_value,
            reason=("сохранена ручная правка" if d.preserved else "обновлено пересчётом"),
            triggered=True,
        )
    return doc, diffs


# ─────────────────────────── вспомогательное ───────────────────────────

def _open_for_decision(status: ApprovalStatus) -> ApprovalStatus:
    """Привести узел к under_review перед approve/reject (открыть на просмотр)."""
    if status in (ApprovalStatus.PROPOSED_BY_AI, ApprovalStatus.NEEDS_REVISION):
        return next_status(status, Action.OPEN_REVIEW)
    return status


def merge_proposal_context(
    doc: GoalDecompositionDocument, proposal: Proposal, parent_id: Optional[str]
) -> None:
    """Пришить допущения и dataGaps предложения к родителю (цели/периоду)."""
    target: Any = doc.goal if parent_id is None else _find_period(doc, parent_id)
    seen_a = {a.id for a in target.assumptions}
    for raw in proposal.assumptions:
        obj = Assumption.model_validate(raw)
        if obj.id not in seen_a:
            target.assumptions.append(obj)
            seen_a.add(obj.id)
    seen_g = {g.id for g in target.data_gaps}
    for raw in proposal.data_gaps:
        gap = DataGap.model_validate(raw)
        if gap.id not in seen_g:
            target.data_gaps.append(gap)
            seen_g.add(gap.id)


def _references_assumption(period: Period, assumption_id: str) -> bool:
    return any(m.assumption_ref == assumption_id for m in period.allocated_metrics)


def _parent_level(
    doc: GoalDecompositionDocument, parent_id: Optional[str]
) -> Optional[PeriodLevel]:
    if parent_id is None:
        return None
    return _find_period(doc, parent_id).level


def _find_period(doc: GoalDecompositionDocument, period_id: str) -> Period:
    for p in doc.periods:
        if p.id == period_id:
            return p
    raise PeriodNotFound(f"Период '{period_id}' не найден")


def _find_assumption(doc: GoalDecompositionDocument, assumption_id: str) -> Assumption:
    pools: list[list[Assumption]] = [doc.goal.assumptions]
    pools.extend(p.assumptions for p in doc.periods)
    for pool in pools:
        for a in pool:
            if a.id == assumption_id:
                return a
    raise AssumptionNotFound(f"Допущение '{assumption_id}' не найдено")


def _period_id(level: PeriodLevel, parent_id: Optional[str], index: int) -> str:
    prefix = level.value.lower()
    return f"{parent_id}-{prefix}-{index}" if parent_id else f"{prefix}-{index}"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _log(
    doc: GoalDecompositionDocument,
    actor: Actor,
    entity_ref: str,
    action: ChangeAction,
    *,
    field: Optional[str] = None,
    old: Any = None,
    new: Any = None,
    reason: Optional[str] = None,
    triggered: bool = False,
) -> None:
    doc.change_log.append(ChangeLogEntry(
        id=uuid.uuid4().hex,
        timestamp=_now(),
        actor=actor,
        entity_ref=entity_ref,
        action=action,
        field=field,
        old_value=old,
        new_value=new,
        reason=reason,
        triggered_recalculation=triggered,
    ))
