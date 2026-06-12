"""Тесты классификатора помощника: данные vs модель, рычаги, недостижимость."""
from backend.services.goal_decomposition.data_fix.classifier import classify
from backend.services.goal_decomposition.data_fix.types import (
    Diagnosis,
    Lever,
    LeverKind,
    Problem,
    ProblemKind,
)

GOAL = {"id": "g1", "startDate": "2026-07-01", "deadline": "2026-12-31",
        "assumptions": [], "constraints": []}


def _gap(gid="dg1", blocking=True, unit="₽/мес", param="Месячный бюджет ФОТ"):
    return {"id": gid, "requiredParameter": param, "expectedUnit": unit,
            "blocksDecomposition": blocking}


def _kinds(d: Diagnosis):
    return {p.kind for p in d.problems}


def _lever_kinds(d: Diagnosis):
    return {lv.kind for lv in d.levers}


# ─────────────────────────── нехватка данных ───────────────────────────

def test_blocked_is_insufficient_and_applicable():
    d = classify(status="blocked", data_gaps=[_gap()], verifier_errors=[], goal=GOAL)
    assert ProblemKind.INSUFFICIENT_DATA in _kinds(d)
    assert d.assistant_applicable is True
    assert LeverKind.PROVIDE_FACT in _lever_kinds(d)


def test_non_blocking_gap_ignored():
    d = classify(status="proposed", data_gaps=[_gap(blocking=False)], verifier_errors=[], goal=GOAL)
    assert d.problems == ()
    assert d.assistant_applicable is False


# ─────────────────────────── промах модели ───────────────────────────

def test_model_error_not_applicable():
    d = classify(status="error", data_gaps=[],
                 verifier_errors=[{"code": "ConservationError"}, {"code": "FabricatedInput"}],
                 goal=GOAL)
    assert _kinds(d) == {ProblemKind.MODEL_ISSUE}
    assert d.assistant_applicable is False   # помощник НЕ вмешивается в промахи модели


def test_mixed_model_and_data_stays_applicable():
    # есть и промах модели, и блокирующий пробел → помощник уместен (из-за данных)
    d = classify(status="error", data_gaps=[_gap()],
                 verifier_errors=[{"code": "ConservationError"}], goal=GOAL)
    assert d.assistant_applicable is True
    assert ProblemKind.INSUFFICIENT_DATA in _kinds(d)


# ─────────────── глубокие противоречия из ConstraintViolation верификатора ───────────────

def test_bound_violation_is_infeasible_with_computed_lever():
    # бюджет не покрывает план: ConstraintViolation(bound, observed=1.2М, limit=1.0М)
    cv = {"code": "ConstraintViolation", "kind": "bound", "constraint_id": "fot",
          "observed": 1_200_000.0, "limit": 1_000_000.0}
    d = classify(status="error", data_gaps=[], verifier_errors=[cv], goal=GOAL)
    assert ProblemKind.INFEASIBLE in _kinds(d)
    assert d.assistant_applicable is True            # это проблема данных, не модели
    relax = next(lv for lv in d.levers if lv.kind is LeverKind.RELAX_CONSTRAINT)
    assert relax.computable is True and relax.computed_value == 1_200_000.0
    assert any(lv.is_goal_change for lv in d.levers)  # «снизить цель» доступна, но особым путём


def test_dependency_violation_is_contradiction():
    cv = {"code": "ConstraintViolation", "kind": "dependency", "constraint_id": "dep:Офис"}
    d = classify(status="error", data_gaps=[], verifier_errors=[cv], goal=GOAL)
    assert ProblemKind.CONTRADICTION in _kinds(d)
    assert d.assistant_applicable is True
    assert LeverKind.RELAX_CONSTRAINT in _lever_kinds(d)


def test_constraint_violation_not_treated_as_model_issue():
    cv = {"code": "ConstraintViolation", "kind": "bound", "constraint_id": "fot",
          "observed": 5.0, "limit": 1.0}
    d = classify(status="error", data_gaps=[], verifier_errors=[cv], goal=GOAL)
    assert ProblemKind.MODEL_ISSUE not in _kinds(d)


# ─────────────────────────── допущения ───────────────────────────

def test_confirm_assumption_lever_when_structural():
    goal = {**GOAL, "assumptions": [
        {"id": "a1", "statement": "Регистрация 5 дней", "unit": "дней",
         "needsConfirmationFrom": "юрист", "status": "unconfirmed"}]}
    d = classify(status="blocked", data_gaps=[_gap()], verifier_errors=[], goal=goal)
    assert LeverKind.CONFIRM_ASSUMPTION in _lever_kinds(d)


def test_problem_rests_on_assumption_by_unit():
    # блокирующий пробел в ₽/мес и допущение в ₽/мес → проблема помечена допущением
    goal = {**GOAL, "assumptions": [
        {"id": "a-budget", "statement": "Бюджет ~1.5М", "unit": "₽/мес",
         "needsConfirmationFrom": "финдиректор", "status": "unconfirmed"}]}
    d = classify(status="blocked", data_gaps=[_gap(unit="₽/мес")], verifier_errors=[], goal=goal)
    gap_problem = next(p for p in d.problems if p.kind is ProblemKind.INSUFFICIENT_DATA)
    assert gap_problem.rests_on_assumption == "a-budget"


# ─────────────────────────── противоречие / изменение цели ───────────────────────────

def test_deadline_before_start_contradiction():
    goal = {**GOAL, "startDate": "2026-07-01", "deadline": "2026-06-01"}
    d = classify(status="blocked", data_gaps=[], verifier_errors=[], goal=goal)
    assert ProblemKind.CONTRADICTION in _kinds(d)
    change = [lv for lv in d.levers if lv.kind is LeverKind.CHANGE_GOAL]
    assert change and change[0].is_goal_change is True   # «снизить цель» — особый путь


# ─────────────────────────── proposed / недостижимость ───────────────────────────

def test_proposed_no_problems():
    d = classify(status="proposed", data_gaps=[], verifier_errors=[], goal=GOAL)
    assert d.problems == () and d.levers == ()
    assert d.assistant_applicable is False


def test_unreachable_only_when_goal_change_resolves():
    # противоречие, и единственный рычаг — изменение цели → честно «недостижимо»
    only_goal = Diagnosis(
        problems=(Problem(ProblemKind.CONTRADICTION, "x", "goal"),),
        levers=(Lever(LeverKind.CHANGE_GOAL, "goal", is_goal_change=True),),
    )
    assert only_goal.unreachable is True
    # есть и обычный рычаг → не недостижимо
    with_relax = Diagnosis(
        problems=only_goal.problems,
        levers=(*only_goal.levers, Lever(LeverKind.RELAX_CONSTRAINT, "goal:deadline")),
    )
    assert with_relax.unreachable is False


# ─────────────────────────── логи без секретов ───────────────────────────

def test_log_summary_has_no_values():
    d = classify(status="blocked", data_gaps=[_gap(param="СЕКРЕТ-ПАРАМЕТР")],
                 verifier_errors=[], goal=GOAL)
    summary = d.log_summary()
    assert "СЕКРЕТ" not in summary           # ни значений, ни деталей
    assert "insufficient_data" in summary    # только типы/счётчики
