"""Типы проблем и рычагов помощника по исправлению данных (чистые dataclass-и)."""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Iterable, Optional


class ProblemKind(str, Enum):
    INSUFFICIENT_DATA = "insufficient_data"  # блокирующий dataGap — не хватает факта
    CONTRADICTION = "contradiction"          # факты несовместимы
    INFEASIBLE = "infeasible"                # hard-ограничения не удовлетворимы
    MODEL_ISSUE = "model_issue"              # промах модели — НЕ для помощника (лечит ретрай)


# Проблемы, на которые помощник имеет право вмешаться.
STRUCTURAL_KINDS = frozenset({
    ProblemKind.INSUFFICIENT_DATA,
    ProblemKind.CONTRADICTION,
    ProblemKind.INFEASIBLE,
})


class LeverKind(str, Enum):
    PROVIDE_FACT = "provide_fact"            # дать недостающий/уточнить факт (→ user_input)
    CONFIRM_ASSUMPTION = "confirm_assumption"  # подтвердить допущение, на котором стоит проблема
    RELAX_CONSTRAINT = "relax_constraint"    # ослабить ограничение (бюджет/дедлайн)
    CHANGE_GOAL = "change_goal"              # снизить/изменить цель — через recalc, НЕ дефолт


@dataclass(frozen=True)
class Problem:
    """Одна структурная проблема. detail — короткое МАШИННОЕ описание (не от модели)."""
    kind: ProblemKind
    code: str
    entity_ref: str
    detail: str = ""
    rests_on_assumption: Optional[str] = None  # id допущения, если проблема стоит на нём


@dataclass(frozen=True)
class Lever:
    """Рычаг-вариант для человека. Числа считает детерминированный слой, не модель."""
    kind: LeverKind
    target_ref: str
    label: str = ""
    computable: bool = False                 # можно ли вычислить нужное значение из данных
    computed_value: Optional[float] = None   # вычисленное значение (если computable)
    is_goal_change: bool = False             # CHANGE_GOAL — особый путь, не по умолчанию
    needs_external_fact: bool = False        # нужен внешний факт (посчитать нельзя)


@dataclass(frozen=True)
class Diagnosis:
    problems: tuple[Problem, ...] = ()
    levers: tuple[Lever, ...] = ()

    @property
    def assistant_applicable(self) -> bool:
        """Помощник уместен, только если есть структурная проблема данных."""
        return any(p.kind in STRUCTURAL_KINDS for p in self.problems)

    @property
    def unreachable(self) -> bool:
        """Честный вывод «недостижимо»: есть противоречие/невыполнимость, и снять её
        может только изменение цели (которое не предлагается по умолчанию)."""
        hard = [p for p in self.problems
                if p.kind in (ProblemKind.CONTRADICTION, ProblemKind.INFEASIBLE)]
        if not hard:
            return False
        return not any(not lv.is_goal_change for lv in self.levers)

    def log_summary(self) -> str:
        """Сводка для логов — только типы и счётчики, без значений (как Фаза 6)."""
        probs = _counts(p.kind.value for p in self.problems)
        levs = _counts(lv.kind.value for lv in self.levers)
        return f"problems[{probs}] levers[{levs}] applicable={self.assistant_applicable}"


def _counts(values: Iterable[str]) -> str:
    counts: dict[str, int] = {}
    for v in values:
        counts[v] = counts.get(v, 0) + 1
    return ", ".join(f"{k}×{n}" for k, n in sorted(counts.items())) or "—"
