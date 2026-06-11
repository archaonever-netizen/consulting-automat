"""Тесты каскада и merge с сохранением ручных правок."""
from backend.services.goal_decomposition.domain import (
    ApprovalRecord,
    ApprovalStatus,
    DateRange,
    Derivation,
    Goal,
    GoalDecompositionDocument,
    Metric,
    Period,
    PeriodLevel,
    ProposedBy,
    Source,
)
from backend.services.goal_decomposition.recalc import (
    cascade_mark_needs_revision,
    descendants,
    merge_children,
)


def _approval(status=ApprovalStatus.APPROVED):
    return ApprovalRecord(status=status, proposed_by=ProposedBy.AI)


def _period(pid, index, value, parent=None, level=PeriodLevel.MONTH, source=Source.DERIVED,
            status=ApprovalStatus.APPROVED):
    metric = Metric(
        id="headcount", name="Найм", unit="чел.", target_value=value, source=source,
        derivation=Derivation(formula="волна", inputs=["headcount"]) if source is Source.DERIVED else None,
        confidence="medium",
    )
    return Period(
        id=pid, level=level, index=index, parent_id=parent,
        date_range=DateRange(range_from="2026-07-01", range_to="2026-07-31"),
        allocated_metrics=[metric], approval=_approval(status),
    )


def _doc(periods):
    goal = Goal.model_validate({
        "id": "g1", "title": "t", "startDate": "2026-07-01", "deadline": "2026-12-31",
        "targetMetrics": [{"id": "headcount", "name": "Найм", "unit": "чел.",
                           "targetValue": 10, "source": "user_input"}],
        "status": "decomposing",
    })
    return GoalDecompositionDocument(goal=goal, periods=periods)


def test_descendants_of_goal_is_all():
    doc = _doc([_period("month-1", 1, 6), _period("month-2", 2, 4)])
    assert {p.id for p in descendants(doc, None)} == {"month-1", "month-2"}


def test_descendants_nested():
    doc = _doc([
        _period("month-1", 1, 10),
        _period("month-1-week-1", 1, 10, parent="month-1", level=PeriodLevel.WEEK),
    ])
    assert {p.id for p in descendants(doc, "month-1")} == {"month-1-week-1"}


def test_cascade_marks_approved_needs_revision():
    doc = _doc([
        _period("month-1", 1, 10, status=ApprovalStatus.APPROVED),
        _period("month-1-week-1", 1, 10, parent="month-1", level=PeriodLevel.WEEK,
                status=ApprovalStatus.APPROVED),
        _period("month-1-week-2", 2, 0, parent="month-1", level=PeriodLevel.WEEK,
                status=ApprovalStatus.PROPOSED_BY_AI),
    ])
    affected = cascade_mark_needs_revision(doc, "month-1")
    assert affected == ["month-1-week-1"]  # только approved-узел
    statuses = {p.id: p.approval.status for p in doc.periods}
    assert statuses["month-1-week-1"] is ApprovalStatus.NEEDS_REVISION
    assert statuses["month-1-week-2"] is ApprovalStatus.PROPOSED_BY_AI


def test_merge_preserves_human_edit():
    existing = [_period("month-1", 1, 5, source=Source.USER_INPUT)]  # человек поставил 5
    proposed = [_period("month-1", 1, 7, source=Source.DERIVED)]     # ИИ предлагает 7
    merged, diffs = merge_children(existing, proposed)
    # сохранена ручная правка 5
    assert merged[0].allocated_metrics[0].target_value == 5
    assert merged[0].allocated_metrics[0].source is Source.USER_INPUT
    assert len(diffs) == 1
    d = diffs[0]
    assert d.preserved is True and d.old_value == 5 and d.new_value == 7


def test_merge_updates_ai_metric():
    existing = [_period("month-1", 1, 4, source=Source.DERIVED)]
    proposed = [_period("month-1", 1, 6, source=Source.DERIVED)]
    merged, diffs = merge_children(existing, proposed)
    assert merged[0].allocated_metrics[0].target_value == 6
    assert diffs[0].preserved is False and diffs[0].old_value == 4 and diffs[0].new_value == 6
