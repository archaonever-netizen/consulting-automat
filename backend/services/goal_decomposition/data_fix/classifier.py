"""Детерминированная классификация состояния декомпозиции (шаг 1).

Отделяет СТРУКТУРНЫЕ проблемы данных (нехватка/противоречие/невыполнимость —
ими занимается помощник) от ПРОМАХОВ модели (ConservationError, FabricatedInput
и т.п. — их лечит ретрай/верификатор, помощник не вмешивается).

Чистая функция без сети и БД. Человекочитаемые формулировки и тексты рычагов —
отдельный слой (лёгкая модель, шаг 2); здесь только машинная структура.
"""
from __future__ import annotations

from typing import Any, Mapping

from .types import Diagnosis, Lever, LeverKind, Problem, ProblemKind

# Коды ошибок верификатора, которые означают промах модели (а не проблему данных).
MODEL_ERROR_CODES = frozenset({
    "ConservationError",
    "FabricatedInput",
    "MissingDerivation",
    "OrphanAssumptionValue",
    "FakeMeasurement",
    "UnaccountedMetric",
})


def classify(
    *,
    status: str,
    data_gaps: list[Mapping[str, Any]],
    verifier_errors: list[Mapping[str, Any]],
    goal: Mapping[str, Any],
) -> Diagnosis:
    """Классифицировать результат попытки декомпозиции.

    status          — "proposed" | "blocked" | "error".
    data_gaps       — dataGaps предложения (для нехватки данных).
    verifier_errors — типизированные ошибки верификатора (Report.to_dicts):
                      ConstraintViolation(bound/dependency) → проблема данных;
                      остальные коды (ConservationError и т.п.) → промах модели.
    goal            — цель (camelCase: startDate/deadline/assumptions/constraints).
    """
    problems: list[Problem] = []
    levers: list[Lever] = []
    codes = [str(e.get("code")) for e in verifier_errors]

    unconfirmed = [a for a in (goal.get("assumptions") or [])
                   if str(a.get("status")) == "unconfirmed"]
    # Допущение, которое могло бы закрыть пробел в той же единице измерения.
    unit_to_assumption: dict[str, str] = {}
    for a in unconfirmed:
        unit = a.get("unit")
        if unit:
            unit_to_assumption.setdefault(str(unit), str(a.get("id") or "?"))

    # 1. Нехватка данных: блокирующие dataGap.
    for gap in data_gaps:
        if not gap.get("blocksDecomposition"):
            continue
        gid = str(gap.get("id") or "?")
        expected_unit = gap.get("expectedUnit")
        rests = unit_to_assumption.get(str(expected_unit)) if expected_unit else None
        problems.append(Problem(
            kind=ProblemKind.INSUFFICIENT_DATA, code="blocking_gap",
            entity_ref=f"dataGap:{gid}", detail=str(gap.get("requiredParameter") or ""),
            rests_on_assumption=rests,
        ))
        levers.append(Lever(
            kind=LeverKind.PROVIDE_FACT, target_ref=f"dataGap:{gid}",
            label=str(gap.get("requiredParameter") or ""),
            computable=False, needs_external_fact=True,
        ))

    # 2. Допущения: отдельный рычаг «подтвердить» — не выдаём догадку за факт.
    if problems:  # предлагаем подтверждение только при наличии структурной проблемы
        for a in unconfirmed:
            levers.append(Lever(
                kind=LeverKind.CONFIRM_ASSUMPTION,
                target_ref=f"assumption:{a.get('id') or '?'}",
                label=str(a.get("statement") or ""),
            ))

    # 3. Противоречие: дедлайн не позже даты старта (ISO-строки сравнимы лексикографически).
    start = str(goal.get("startDate") or "")
    deadline = str(goal.get("deadline") or "")
    if start and deadline and deadline <= start:
        problems.append(Problem(
            kind=ProblemKind.CONTRADICTION, code="deadline_before_start",
            entity_ref="goal:deadline", detail="дедлайн не позже даты старта",
        ))
        levers.append(Lever(
            kind=LeverKind.RELAX_CONSTRAINT, target_ref="goal:deadline",
            label="сдвинуть дедлайн", needs_external_fact=True,
        ))
        levers.append(Lever(
            kind=LeverKind.CHANGE_GOAL, target_ref="goal",
            label="изменить цель", is_goal_change=True,
        ))

    # 4. Невыполнимость/противоречие из ConstraintViolation верификатора
    #    (бюджет не покрывает план / зависимости вех не укладываются). Это проблема
    #    ДАННЫХ, а не модели; числа для рычагов берём из самой ошибки.
    for e in verifier_errors:
        if e.get("code") != "ConstraintViolation":
            continue
        cid = str(e.get("constraint_id") or "?")
        if e.get("kind") == "bound":
            observed = e.get("observed")
            problems.append(Problem(
                kind=ProblemKind.INFEASIBLE, code="hard_bound_exceeded",
                entity_ref=f"constraint:{cid}", detail="план превышает жёсткий лимит",
            ))
            levers.append(Lever(
                kind=LeverKind.RELAX_CONSTRAINT, target_ref=f"constraint:{cid}",
                label="поднять лимит до требуемого",
                computable=isinstance(observed, (int, float)),
                computed_value=float(observed) if isinstance(observed, (int, float)) else None,
            ))
            levers.append(Lever(
                kind=LeverKind.CHANGE_GOAL, target_ref="goal",
                label="снизить цель", is_goal_change=True,
            ))
        elif e.get("kind") == "dependency":
            problems.append(Problem(
                kind=ProblemKind.CONTRADICTION, code="dependency_infeasible",
                entity_ref=f"constraint:{cid}", detail="зависимости вех не укладываются в срок",
            ))
            levers.append(Lever(
                kind=LeverKind.RELAX_CONSTRAINT, target_ref="goal:deadline",
                label="сдвинуть дедлайн", needs_external_fact=True,
            ))
            levers.append(Lever(
                kind=LeverKind.CHANGE_GOAL, target_ref="goal",
                label="снизить цель", is_goal_change=True,
            ))

    # 5. Промах модели: status=error и ВСЕ коды — модельные (ConstraintViolation
    #    в их число не входит — он структурный). Помощник не вмешивается.
    if status == "error" and codes and all(c in MODEL_ERROR_CODES for c in codes):
        problems.append(Problem(
            kind=ProblemKind.MODEL_ISSUE, code="model_miss", entity_ref="engine",
            detail="промах модели — устраняется повтором, не данными",
        ))

    return Diagnosis(problems=tuple(problems), levers=_dedup_levers(levers))


def _dedup_levers(levers: list[Lever]) -> tuple[Lever, ...]:
    """Убрать дубли рычагов (например, несколько change_goal от разных нарушений)."""
    seen: set[tuple[str, str, bool]] = set()
    out: list[Lever] = []
    for lv in levers:
        key = (lv.kind.value, lv.target_ref, lv.is_goal_change)
        if key in seen:
            continue
        seen.add(key)
        out.append(lv)
    return tuple(out)
