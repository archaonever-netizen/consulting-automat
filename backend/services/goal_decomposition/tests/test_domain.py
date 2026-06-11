"""Тесты доменного слоя: структурные инварианты делают недопустимое непредставимым.

Позитив — валидные метрики каждого происхождения и round-trip документа.
Негатив — derived без derivation, assumption без ref, ложный measured,
несуществующий source, пустые targetMetrics, index<1, чужой schemaVersion,
посторонние ключи.
"""
import pytest
from pydantic import ValidationError

from backend.services.goal_decomposition.domain import (
    Aggregation,
    ApprovalRecord,
    ApprovalStatus,
    Confidence,
    DateRange,
    Derivation,
    Goal,
    GoalDecompositionDocument,
    GoalStatus,
    Metric,
    Period,
    PeriodLevel,
    ProposedBy,
    Source,
)

# ─────────────────────────── билдеры ───────────────────────────

def _metric_user_input(**over) -> Metric:
    base = dict(id="headcount", name="Найм", unit="чел.", target_value=10, source=Source.USER_INPUT)
    base.update(over)
    return Metric(**base)


def _approval(status=ApprovalStatus.PROPOSED_BY_AI) -> ApprovalRecord:
    return ApprovalRecord(status=status, proposed_by=ProposedBy.AI)


def _minimal_goal() -> Goal:
    return Goal(
        id="11111111-1111-1111-1111-111111111111",
        title="Подразделение в Новосибирске",
        start_date="2026-07-01",
        deadline="2026-12-31",
        target_metrics=[_metric_user_input()],
        status=GoalStatus.DRAFT,
    )


def _minimal_period() -> Period:
    return Period(
        id="month-1",
        level=PeriodLevel.MONTH,
        index=1,
        parent_id=None,
        date_range=DateRange(range_from="2026-07-01", range_to="2026-07-31"),
        approval=_approval(),
    )


# ─────────────────────────── позитив ───────────────────────────

def test_metric_user_input_ok():
    m = _metric_user_input()
    assert m.source is Source.USER_INPUT


def test_metric_derived_ok():
    m = Metric(
        id="breakeven", name="Окупаемость", unit="₽/мес", target_value=0,
        source=Source.DERIVED,
        derivation=Derivation(formula="revenue - costs", inputs=["revenue", "costs"]),
        confidence=Confidence.MEDIUM,
    )
    assert m.derivation.formula == "revenue - costs"


def test_metric_assumption_ok():
    m = Metric(
        id="ramp", name="Выручка", unit="₽/мес", target_value=500000,
        source=Source.ASSUMPTION, assumption_ref="a-revenue-ramp", confidence=Confidence.LOW,
    )
    assert m.assumption_ref == "a-revenue-ramp"


def test_metric_measured_ok():
    m = Metric(
        id="hired", name="Нанято", unit="чел.", current_value=4,
        measured_at="2026-08-31T00:00:00Z", evidence="hr-export#row12",
        source=Source.USER_INPUT, confidence=Confidence.MEASURED,
    )
    assert m.confidence is Confidence.MEASURED


def test_document_roundtrip_storage():
    doc = GoalDecompositionDocument(goal=_minimal_goal(), periods=[_minimal_period()])
    dumped = doc.to_storage()
    # camelCase в хранилище
    assert dumped["schemaVersion"] == "1.0.0"
    assert dumped["goal"]["targetMetrics"][0]["targetValue"] == 10
    assert dumped["periods"][0]["dateRange"]["from"] == "2026-07-01"
    # обратная загрузка эквивалентна
    restored = GoalDecompositionDocument.from_storage(dumped)
    assert restored == doc


def test_metric_aggregation_default_flow():
    assert _metric_user_input().aggregation is Aggregation.FLOW


def test_metric_aggregation_endpoint_roundtrip():
    m = _metric_user_input(aggregation=Aggregation.ENDPOINT)
    assert m.aggregation is Aggregation.ENDPOINT
    dumped = m.model_dump(by_alias=True)
    assert dumped["aggregation"] == "endpoint"
    assert Metric.model_validate(dumped).aggregation is Aggregation.ENDPOINT


def test_camelcase_validation():
    raw = {
        "id": "x", "name": "Найм", "unit": "чел.",
        "targetValue": 3, "source": "derived",
        "derivation": {"formula": "sum(children)", "inputs": ["m1", "m2"]},
    }
    m = Metric.model_validate(raw)
    assert m.target_value == 3
    assert m.derivation.inputs == ["m1", "m2"]


# ─────────────────────────── негатив ───────────────────────────

def test_derived_without_derivation_rejected():
    with pytest.raises(ValidationError):
        Metric(id="x", name="n", unit="u", source=Source.DERIVED)


def test_assumption_without_ref_rejected():
    with pytest.raises(ValidationError):
        Metric(id="x", name="n", unit="u", source=Source.ASSUMPTION)


def test_assumption_blank_ref_rejected():
    with pytest.raises(ValidationError):
        Metric(id="x", name="n", unit="u", source=Source.ASSUMPTION, assumption_ref="   ")


def test_fake_measured_rejected():
    # confidence=measured без фактического замера
    with pytest.raises(ValidationError):
        Metric(id="x", name="n", unit="u", source=Source.USER_INPUT, confidence=Confidence.MEASURED)


def test_measured_missing_evidence_rejected():
    with pytest.raises(ValidationError):
        Metric(
            id="x", name="n", unit="u", current_value=4, measured_at="2026-08-31T00:00:00Z",
            source=Source.USER_INPUT, confidence=Confidence.MEASURED,  # нет evidence
        )


def test_invented_source_rejected():
    with pytest.raises(ValidationError):
        Metric.model_validate({"id": "x", "name": "n", "unit": "u", "source": "ai_invented"})


def test_goal_requires_target_metric():
    with pytest.raises(ValidationError):
        Goal(
            id="g", title="t", start_date="2026-07-01", deadline="2026-12-31",
            target_metrics=[], status=GoalStatus.DRAFT,
        )


def test_period_index_must_be_positive():
    with pytest.raises(ValidationError):
        Period(
            id="p", level=PeriodLevel.MONTH, index=0, parent_id=None,
            date_range=DateRange(range_from="2026-07-01", range_to="2026-07-31"),
            approval=_approval(),
        )


def test_wrong_schema_version_rejected():
    with pytest.raises(ValidationError):
        GoalDecompositionDocument(goal=_minimal_goal(), schema_version="2.0.0")


def test_extra_field_forbidden():
    with pytest.raises(ValidationError):
        Metric.model_validate(
            {"id": "x", "name": "n", "unit": "u", "source": "user_input", "bogus": 1}
        )
