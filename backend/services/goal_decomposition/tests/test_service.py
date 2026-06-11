"""Тесты сервисного слоя: создание, декомпозиция, согласование, правки, пересчёт."""
import pytest

from backend.services.goal_decomposition.domain import (
    Actor,
    ActorKind,
    Aggregation,
    ApprovalStatus,
    AssumptionStatus,
    ChangeAction,
    Goal,
    PeriodLevel,
    Source,
)
from backend.services.goal_decomposition.engine import Proposal
from backend.services.goal_decomposition.service import (
    DecomposeNotAllowed,
    MetricEdit,
    approve_period,
    attach_decomposition,
    confirm_assumption,
    create_goal_document,
    edit_period,
    recalculate,
)

HUMAN = Actor(kind=ActorKind.HUMAN, ref="user:1")
AI = Actor(kind=ActorKind.AI, ref="ai:test@1.0.0")


def _goal():
    return Goal.model_validate({
        "id": "g1", "title": "Подразделение в Новосибирске",
        "startDate": "2026-07-01", "deadline": "2026-12-31",
        "targetMetrics": [{"id": "headcount", "name": "Найм", "unit": "чел.",
                           "targetValue": 10, "source": "user_input"}],
        "status": "draft",
    })


def _alloc(value):
    return {"id": "headcount", "name": "Найм", "unit": "чел.", "targetValue": value,
            "source": "derived", "derivation": {"formula": "волна", "inputs": ["headcount"]},
            "confidence": "medium"}


def _child(index, value, dfrom, dto):
    return {"index": index, "dateRange": {"from": dfrom, "to": dto},
            "allocatedMetrics": [_alloc(value)], "milestones": []}


def _months_proposal(split, assumptions=None):
    return Proposal(
        status="proposed", level="MONTH",
        children=[_child(*s) for s in split],
        assumptions=assumptions or [],
    )


# ─────────────────────────── создание / декомпозиция ───────────────────────────

def test_create_logs_creation():
    doc = create_goal_document(_goal(), HUMAN)
    assert doc.goal.id == "g1"
    assert doc.change_log[0].action is ChangeAction.CREATE
    assert doc.change_log[0].actor.kind is ActorKind.HUMAN


def test_attach_decomposition_creates_proposed_periods():
    doc = create_goal_document(_goal(), HUMAN)
    proposal = _months_proposal(
        [(1, 6, "2026-07-01", "2026-07-31"), (2, 4, "2026-08-01", "2026-08-31")],
        assumptions=[{"id": "a1", "statement": "Выручка нарастает", "assumedValue": 1,
                      "needsConfirmationFrom": "финдиректор", "status": "unconfirmed"}],
    )
    attach_decomposition(doc, proposal, PeriodLevel.MONTH, None, AI)
    assert [p.id for p in doc.periods] == ["month-1", "month-2"]
    assert all(p.approval.status is ApprovalStatus.PROPOSED_BY_AI for p in doc.periods)
    # допущение пришито к цели
    assert doc.goal.assumptions[0].id == "a1"
    # лог создания — от ИИ
    create_logs = [e for e in doc.change_log if e.action is ChangeAction.CREATE
                   and e.entity_ref.startswith("period:")]
    assert len(create_logs) == 2 and create_logs[0].actor.kind is ActorKind.AI


def test_aggregation_inherited_not_invented():
    goal = Goal.model_validate({
        "id": "g1", "title": "t", "startDate": "2026-07-01", "deadline": "2026-12-31",
        "targetMetrics": [{"id": "revenue", "name": "Выручка", "unit": "₽/мес",
                           "targetValue": 500000, "source": "user_input",
                           "aggregation": "endpoint"}],
        "status": "draft",
    })
    doc = create_goal_document(goal, HUMAN)
    # модель пытается «выдумать» aggregation=flow — должно быть проигнорировано
    child = {"index": 1, "dateRange": {"from": "2026-07-01", "to": "2026-07-31"},
             "allocatedMetrics": [{"id": "revenue", "name": "Выручка", "unit": "₽/мес",
                                   "targetValue": 500000, "source": "derived",
                                   "derivation": {"formula": "финал", "inputs": ["revenue"]},
                                   "confidence": "low", "aggregation": "flow"}],
             "milestones": []}
    attach_decomposition(doc, Proposal(status="proposed", level="MONTH", children=[child]),
                         PeriodLevel.MONTH, None, AI)
    m = doc.periods[0].allocated_metrics[0]
    assert m.aggregation is Aggregation.ENDPOINT  # унаследовано от цели, не flow от модели


# ─────────────────────────── спуск только из approved ───────────────────────────

def test_descend_blocked_until_parent_approved():
    doc = create_goal_document(_goal(), HUMAN)
    attach_decomposition(doc, _months_proposal([(1, 10, "2026-07-01", "2026-07-31")]),
                         PeriodLevel.MONTH, None, AI)
    # месяц ещё proposed_by_ai → спуск на недели запрещён
    weeks = _months_proposal([(1, 10, "2026-07-01", "2026-07-07")])
    weeks.level = "WEEK"
    with pytest.raises(DecomposeNotAllowed):
        attach_decomposition(doc, weeks, PeriodLevel.WEEK, "month-1", AI)
    # одобряем месяц → спуск разрешён
    approve_period(doc, "month-1", reviewed_by="user:1", comment="ок", actor=HUMAN)
    attach_decomposition(doc, weeks, PeriodLevel.WEEK, "month-1", AI)
    assert any(p.level is PeriodLevel.WEEK for p in doc.periods)


def test_approve_sets_approved_and_logs():
    doc = create_goal_document(_goal(), HUMAN)
    attach_decomposition(doc, _months_proposal([(1, 10, "2026-07-01", "2026-07-31")]),
                         PeriodLevel.MONTH, None, AI)
    approve_period(doc, "month-1", reviewed_by="user:1", comment="ок", actor=HUMAN)
    p = next(p for p in doc.periods if p.id == "month-1")
    assert p.approval.status is ApprovalStatus.APPROVED
    assert p.approval.reviewed_by == "user:1"
    assert doc.change_log[-1].action is ChangeAction.APPROVE


# ─────────────────────────── ручная правка ───────────────────────────

def test_edit_sets_user_input_and_needs_revision():
    doc = create_goal_document(_goal(), HUMAN)
    attach_decomposition(doc, _months_proposal([(1, 6, "2026-07-01", "2026-07-31")]),
                         PeriodLevel.MONTH, None, AI)
    edit_period(doc, "month-1", [MetricEdit(metric_id="headcount", target_value=5)], HUMAN)
    p = next(p for p in doc.periods if p.id == "month-1")
    m = p.allocated_metrics[0]
    assert m.target_value == 5
    assert m.source is Source.USER_INPUT
    assert m.derivation is None
    assert p.approval.status is ApprovalStatus.NEEDS_REVISION
    upd = [e for e in doc.change_log if e.action is ChangeAction.UPDATE]
    assert upd and upd[-1].old_value == 6 and upd[-1].new_value == 5


# ─────────────────────────── допущения ───────────────────────────

def test_confirm_assumption_reports_impacted_approved():
    doc = create_goal_document(_goal(), HUMAN)
    # метрика-допущение в месяце
    child = {"index": 1, "dateRange": {"from": "2026-07-01", "to": "2026-07-31"},
             "allocatedMetrics": [{"id": "headcount", "name": "Найм", "unit": "чел.",
                                   "targetValue": 10, "source": "assumption",
                                   "assumptionRef": "a1", "confidence": "low"}],
             "milestones": []}
    proposal = Proposal(status="proposed", level="MONTH", children=[child],
                        assumptions=[{"id": "a1", "statement": "оценка", "assumedValue": 10,
                                      "needsConfirmationFrom": "HR", "status": "unconfirmed"}])
    attach_decomposition(doc, proposal, PeriodLevel.MONTH, None, AI)
    approve_period(doc, "month-1", reviewed_by="user:1", comment=None, actor=HUMAN)
    doc, impacted = confirm_assumption(doc, "a1", AssumptionStatus.CONFIRMED, 9, HUMAN)
    assert impacted == ["month-1"]
    assert doc.goal.assumptions[0].status is AssumptionStatus.CONFIRMED
    assert doc.change_log[-1].action is ChangeAction.CONFIRM_ASSUMPTION


# ─────────────────────────── каскадный пересчёт ───────────────────────────

def test_recalculate_preserves_human_edits_with_diff():
    doc = create_goal_document(_goal(), HUMAN)
    attach_decomposition(
        doc,
        _months_proposal([(1, 6, "2026-07-01", "2026-07-31"), (2, 4, "2026-08-01", "2026-08-31")]),
        PeriodLevel.MONTH, None, AI,
    )
    approve_period(doc, "month-1", reviewed_by="user:1", comment=None, actor=HUMAN)
    approve_period(doc, "month-2", reviewed_by="user:1", comment=None, actor=HUMAN)
    # человек правит месяц-1: 6 → 5 (теперь user_input)
    edit_period(doc, "month-1", [MetricEdit(metric_id="headcount", target_value=5)], HUMAN)

    # пересчёт: ИИ предлагает 7/3 — ручная правка месяца-1 должна устоять
    doc, diffs = recalculate(
        doc, None,
        _months_proposal([(1, 7, "2026-07-01", "2026-07-31"), (2, 3, "2026-08-01", "2026-08-31")]),
        AI,
    )
    m1 = next(p for p in doc.periods if p.id == "month-1").allocated_metrics[0]
    m2 = next(p for p in doc.periods if p.id == "month-2").allocated_metrics[0]
    assert m1.target_value == 5 and m1.source is Source.USER_INPUT  # сохранено
    assert m2.target_value == 3                                     # обновлено ИИ
    # дифф «было → стало» с пометкой сохранения
    preserved = [d for d in diffs if d.preserved]
    assert preserved and preserved[0].period_id == "month-1"
    assert preserved[0].old_value == 5 and preserved[0].new_value == 7
    # затронутые узлы → needs_revision
    assert all(p.approval.status is ApprovalStatus.NEEDS_REVISION for p in doc.periods)
    # пересчёт залогирован с флагом
    recalc_logs = [e for e in doc.change_log if e.action is ChangeAction.RECALCULATE]
    assert recalc_logs and recalc_logs[-1].triggered_recalculation is True
