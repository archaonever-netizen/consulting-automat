"""Тесты детерминированного верификатора.

Обязательные негативы (по требованию): выдуманное число, несходящаяся сумма,
ложный measured, осиротевшее допущение, нарушение жёсткого ограничения и
зависимости вех. Плюс позитив, буфер и сериализация фидбэка.
"""
from backend.services.goal_decomposition.raw import (
    RawAssumption,
    RawConstraint,
    RawDerivation,
    RawMetric,
    RawMilestone,
    RawNode,
)
from backend.services.goal_decomposition.verifier import (
    ConservationError,
    ConstraintViolation,
    FabricatedInput,
    FakeMeasurement,
    MissingDerivation,
    OrphanAssumptionValue,
    UnaccountedMetric,
    verify,
)

# ─────────────────────────── билдеры ───────────────────────────

def _derived(mid: str, value: float) -> RawMetric:
    return RawMetric(
        id=mid, name=mid, unit="чел.", target_value=value, source="derived",
        derivation=RawDerivation(formula="доля найма по месяцам", inputs=["headcount"]),
        confidence="medium",
    )


def _parent_headcount(target: float = 10, **over) -> RawNode:
    return RawNode(id="goal", metrics=[RawMetric(id="headcount", name="Найм", unit="чел.",
                   target_value=target, source="user_input")], **over)


def _codes(report) -> set[str]:
    return {type(e).__name__ for e in report.errors}


# ─────────────────────────── позитив ───────────────────────────

def test_valid_proposal_passes():
    parent = _parent_headcount(10)
    children = [
        RawNode(id="m1", metrics=[_derived("headcount", 6)]),
        RawNode(id="m2", metrics=[_derived("headcount", 4)]),
    ]
    report = verify(parent, children, dataset={"headcount": 10})
    assert report.ok
    assert report.errors == ()


def test_buffer_tolerates_gap():
    # сумма 9 при цели 10, но задан явный буфер 1 → ок
    parent = _parent_headcount(10, buffers={"headcount": 1.0})
    children = [
        RawNode(id="m1", metrics=[_derived("headcount", 5)]),
        RawNode(id="m2", metrics=[_derived("headcount", 4)]),
    ]
    assert verify(parent, children).ok


# ─────────────────────────── негатив: несходящаяся сумма ───────────────────────────

def test_conservation_mismatch_detected():
    parent = _parent_headcount(10)
    children = [
        RawNode(id="m1", metrics=[_derived("headcount", 6)]),
        RawNode(id="m2", metrics=[_derived("headcount", 3)]),  # сумма 9 ≠ 10
    ]
    report = verify(parent, children)
    assert not report.ok
    errs = [e for e in report.errors if isinstance(e, ConservationError)]
    assert errs and errs[0].got == 9 and errs[0].expected == 10


# ─────────────────────────── негатив: выдуманное число ───────────────────────────

def test_fabricated_input_absent_from_dataset():
    parent = _parent_headcount(10)
    children = [RawNode(id="m1", metrics=[
        RawMetric(id="secret_budget", name="Бюджет", unit="₽", target_value=999999,
                  source="user_input"),  # нет в dataset
        _derived("headcount", 10),
    ])]
    report = verify(parent, children, dataset={"headcount": 10})
    assert FabricatedInput.__name__ in _codes(report)


def test_fabricated_input_value_mismatch():
    parent = _parent_headcount(10)
    children = [RawNode(id="m1", metrics=[
        RawMetric(id="rent", name="Аренда", unit="₽/мес", target_value=200000, source="user_input"),
        _derived("headcount", 10),
    ])]
    # dataset знает rent=150000, а заявлено 200000
    report = verify(parent, children, dataset={"headcount": 10, "rent": 150000})
    assert any(isinstance(e, FabricatedInput) for e in report.errors)


def test_invalid_source_is_fabricated():
    parent = _parent_headcount(10)
    children = [RawNode(id="m1", metrics=[
        RawMetric(id="headcount", name="Найм", unit="чел.", target_value=10, source="ai_invented"),
    ])]
    report = verify(parent, children, dataset={"headcount": 10})
    assert any(isinstance(e, FabricatedInput) and "source" in e.reason for e in report.errors)


# ─────────────────────────── негатив: derived без формулы ───────────────────────────

def test_missing_derivation_detected():
    parent = _parent_headcount(10)
    children = [RawNode(id="m1", metrics=[
        RawMetric(id="headcount", name="Найм", unit="чел.", target_value=10, source="derived"),
    ])]
    report = verify(parent, children)
    assert MissingDerivation.__name__ in _codes(report)


# ─────────────────────────── негатив: ложный measured ───────────────────────────

def test_fake_measurement_detected():
    parent = _parent_headcount(10)
    children = [RawNode(id="m1", metrics=[
        RawMetric(id="headcount", name="Найм", unit="чел.", target_value=10, source="derived",
                  derivation=RawDerivation(formula="план", inputs=["headcount"]),
                  confidence="measured"),  # нет currentValue/measuredAt/evidence
    ])]
    report = verify(parent, children)
    assert FakeMeasurement.__name__ in _codes(report)


# ─────────────────────────── негатив: осиротевшее допущение ───────────────────────────

def test_orphan_assumption_no_ref():
    parent = _parent_headcount(10)
    children = [RawNode(id="m1", metrics=[
        RawMetric(id="headcount", name="Найм", unit="чел.", target_value=10, source="assumption"),
    ])]
    report = verify(parent, children)
    assert OrphanAssumptionValue.__name__ in _codes(report)


def test_orphan_assumption_unresolved_ref():
    parent = _parent_headcount(10)
    children = [RawNode(id="m1", metrics=[
        RawMetric(id="headcount", name="Найм", unit="чел.", target_value=10,
                  source="assumption", assumption_ref="ghost"),
    ])]
    report = verify(parent, children)  # допущения 'ghost' нигде нет
    errs = [e for e in report.errors if isinstance(e, OrphanAssumptionValue)]
    assert errs and "не разрешается" in errs[0].reason


def test_orphan_assumption_without_confirmer():
    parent = _parent_headcount(10)
    children = [RawNode(
        id="m1",
        metrics=[RawMetric(id="headcount", name="Найм", unit="чел.", target_value=10,
                           source="assumption", assumption_ref="a1")],
        assumptions=[RawAssumption(id="a1", statement="...", status="unconfirmed")],  # нет needsConfirmationFrom
    )]
    report = verify(parent, children)
    errs = [e for e in report.errors if isinstance(e, OrphanAssumptionValue)]
    assert errs and "needsConfirmationFrom" in errs[0].reason


def test_assumption_with_confirmer_passes():
    parent = _parent_headcount(10)
    children = [RawNode(
        id="m1",
        metrics=[_derived("headcount", 10),
                 RawMetric(id="revenue", name="Выручка", unit="₽/мес", target_value=500000,
                           source="assumption", assumption_ref="a1", confidence="low")],
        assumptions=[RawAssumption(id="a1", statement="Выручка нарастает линейно",
                                   needs_confirmation_from="финдиректор", status="unconfirmed")],
    )]
    report = verify(parent, children, dataset={"headcount": 10})
    assert report.ok


# ─────────────────── негатив: нарушение жёсткого ограничения (bound) ───────────────────

def test_hard_budget_bound_violation():
    parent = RawNode(
        id="goal",
        metrics=[RawMetric(id="headcount", name="Найм", unit="чел.", target_value=10,
                           source="user_input")],
        constraints=[RawConstraint(id="fot", type="budget", description="ФОТ",
                                   value=1_000_000, unit="₽/мес", hard=True)],
    )
    children = [
        RawNode(id="m1", metrics=[_derived("headcount", 10),
                RawMetric(id="fot1", name="ФОТ м1", unit="₽/мес", target_value=700000,
                          source="user_input")]),
        RawNode(id="m2", metrics=[RawMetric(id="fot2", name="ФОТ м2", unit="₽/мес",
                target_value=500000, source="user_input")]),  # сумма 1.2М > 1.0М
    ]
    report = verify(parent, children,
                    dataset={"headcount": 10, "fot1": 700000, "fot2": 500000})
    errs = [e for e in report.errors if isinstance(e, ConstraintViolation) and e.kind == "bound"]
    assert errs


# ─────────────────── негатив: нарушение зависимости вех (dependency) ───────────────────

def test_dependency_order_violation():
    # найм зависит от готовности офиса, но офис готов ПОЗЖЕ найма
    parent = _parent_headcount(10)
    children = [
        RawNode(id="m1", metrics=[_derived("headcount", 10)], milestones=[
            RawMilestone(title="Найм 10 человек", due_date="2026-07-15", status="planned",
                         depends_on=["Офис готов"]),
            RawMilestone(title="Офис готов", due_date="2026-08-20", status="planned"),
        ]),
    ]
    report = verify(parent, children)
    errs = [e for e in report.errors if isinstance(e, ConstraintViolation) and e.kind == "dependency"]
    assert errs


def test_dependency_missing_target():
    parent = _parent_headcount(10)
    children = [RawNode(id="m1", metrics=[_derived("headcount", 10)], milestones=[
        RawMilestone(title="Найм", due_date="2026-07-15", status="planned",
                     depends_on=["Регистрация юрлица"]),  # такой вехи нет
    ])]
    report = verify(parent, children)
    assert any(isinstance(e, ConstraintViolation) and e.kind == "dependency"
               for e in report.errors)


def test_dependency_respected_passes():
    parent = _parent_headcount(10)
    children = [RawNode(id="m1", metrics=[_derived("headcount", 10)], milestones=[
        RawMilestone(title="Офис готов", due_date="2026-07-10", status="planned"),
        RawMilestone(title="Найм", due_date="2026-07-25", status="planned",
                     depends_on=["Офис готов"]),
    ])]
    assert verify(parent, children, dataset={"headcount": 10}).ok


# ─────────────────── негатив: целевая метрика потеряна ───────────────────

def test_unaccounted_goal_metric_detected():
    # у цели две метрики, но дети несут только одну → вторая «потерялась»
    parent = RawNode(id="goal", metrics=[
        RawMetric(id="headcount", name="Найм", unit="чел.", target_value=10, source="user_input"),
        RawMetric(id="office_opened", name="Офис", unit="шт", target_value=1, source="user_input"),
    ])
    children = [RawNode(id="m1", metrics=[_derived("headcount", 10)])]
    report = verify(parent, children, dataset={"headcount": 10, "office_opened": 1})
    errs = [e for e in report.errors if isinstance(e, UnaccountedMetric)]
    assert errs and errs[0].metric_id == "office_opened"


def test_all_goal_metrics_accounted_passes():
    parent = RawNode(id="goal", metrics=[
        RawMetric(id="headcount", name="Найм", unit="чел.", target_value=10, source="user_input"),
        RawMetric(id="office_opened", name="Офис", unit="шт", target_value=1, source="user_input"),
    ])
    children = [
        RawNode(id="m1", metrics=[_derived("headcount", 10),
                RawMetric(id="office_opened", name="Офис", unit="шт", target_value=1,
                          source="derived",
                          derivation=RawDerivation(formula="открытие офиса", inputs=["office_opened"]))]),
    ]
    assert verify(parent, children, dataset={"headcount": 10, "office_opened": 1}).ok


# ─────────────────── endpoint-метрики (уровень «к финишу») ───────────────────

def _endpoint_parent(mid="revenue", target=500000.0):
    return RawNode(id="goal", metrics=[RawMetric(
        id=mid, name="Выручка", unit="₽/мес", target_value=target,
        source="user_input", aggregation="endpoint")])


def _rev_child(value, index, mid="revenue"):
    return RawNode(id=f"m{index}", index=index, metrics=[RawMetric(
        id=mid, name="Выручка", unit="₽/мес", target_value=value, source="derived",
        derivation=RawDerivation(formula="траектория", inputs=[mid]), confidence="medium")])


def test_endpoint_passes_growing_trajectory():
    parent = _endpoint_parent("revenue", 500000)
    children = [_rev_child(100000, 1), _rev_child(300000, 2), _rev_child(500000, 3)]
    # сумма 900000 ≠ 500000, но финал (index 3) == 500000 → endpoint проходит
    assert verify(parent, children).ok


def test_endpoint_passes_decreasing_trajectory():
    parent = _endpoint_parent("defects", 5)
    children = [_rev_child(50, 1, "defects"), _rev_child(20, 2, "defects"), _rev_child(5, 3, "defects")]
    assert verify(parent, children).ok


def test_endpoint_no_false_conservation_error():
    parent = _endpoint_parent("revenue", 500000)
    children = [_rev_child(200000, 1), _rev_child(500000, 2)]  # сумма ≠ цель, финал == цель
    report = verify(parent, children)
    assert report.ok
    assert not any(isinstance(e, ConservationError) for e in report.errors)


def test_endpoint_fails_when_final_off_target():
    parent = _endpoint_parent("revenue", 500000)
    children = [_rev_child(100000, 1), _rev_child(400000, 2)]  # финал 400k ≠ 500k
    report = verify(parent, children)
    errs = [e for e in report.errors if isinstance(e, ConservationError) and e.kind == "endpoint"]
    assert errs and errs[0].got == 400000 and errs[0].expected == 500000


def test_flow_still_sums_with_aggregation_field():
    # метрика с aggregation=flow по-прежнему проверяется суммой
    parent = RawNode(id="goal", metrics=[RawMetric(
        id="headcount", name="Найм", unit="чел.", target_value=10,
        source="user_input", aggregation="flow")])
    bad = [RawNode(id="m1", index=1, metrics=[_derived("headcount", 6)]),
           RawNode(id="m2", index=2, metrics=[_derived("headcount", 3)])]  # сумма 9 ≠ 10
    assert any(isinstance(e, ConservationError) and e.kind == "flow"
               for e in verify(parent, bad).errors)


# ─────────────────────────── фидбэк ───────────────────────────

def test_report_feedback_lists_errors():
    parent = _parent_headcount(10)
    children = [RawNode(id="m1", metrics=[_derived("headcount", 3)])]  # сумма 3 ≠ 10
    report = verify(parent, children)
    feedback = report.to_feedback()
    assert "ConservationError" in feedback
    assert feedback.startswith("Верификатор отклонил")
