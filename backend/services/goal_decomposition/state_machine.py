"""Конечный автомат согласования узла (фаза 4, спецификация §4.1).

    draft ──proposed_by_ai──▶ proposed_by_ai ──open──▶ under_review
       under_review ──approve──▶ approved
       under_review ──reject───▶ rejected
       under_review ──edit─────▶ needs_revision ──repropose──▶ proposed_by_ai
       approved     ──(правка выше по дереву)──▶ needs_revision (каскад)

Спуск на следующий уровень (месяц → недели → дни) разрешён ТОЛЬКО из approved.
Модуль чистый: только правила переходов, без БД и времени.
"""
from __future__ import annotations

from enum import Enum
from typing import Optional

from .domain import ApprovalStatus, PeriodLevel


class Action(str, Enum):
    PROPOSE_AI = "propose_ai"        # ИИ сформировал предложение
    OPEN_REVIEW = "open_review"      # человек открыл на просмотр
    APPROVE = "approve"
    REJECT = "reject"
    EDIT = "edit"                    # человек правит → нужна доработка
    REPROPOSE_AI = "repropose_ai"    # ИИ пересобрал после доработки/отклонения
    CASCADE_REVISE = "cascade_revise"  # правка выше по дереву → требует ревизии


_TARGET: dict[Action, ApprovalStatus] = {
    Action.PROPOSE_AI: ApprovalStatus.PROPOSED_BY_AI,
    Action.OPEN_REVIEW: ApprovalStatus.UNDER_REVIEW,
    Action.APPROVE: ApprovalStatus.APPROVED,
    Action.REJECT: ApprovalStatus.REJECTED,
    Action.EDIT: ApprovalStatus.NEEDS_REVISION,
    Action.REPROPOSE_AI: ApprovalStatus.PROPOSED_BY_AI,
    Action.CASCADE_REVISE: ApprovalStatus.NEEDS_REVISION,
}

_ALLOWED: frozenset[tuple[ApprovalStatus, Action]] = frozenset({
    (ApprovalStatus.DRAFT, Action.PROPOSE_AI),
    (ApprovalStatus.PROPOSED_BY_AI, Action.OPEN_REVIEW),
    (ApprovalStatus.UNDER_REVIEW, Action.APPROVE),
    (ApprovalStatus.UNDER_REVIEW, Action.REJECT),
    (ApprovalStatus.UNDER_REVIEW, Action.EDIT),
    (ApprovalStatus.APPROVED, Action.EDIT),            # правка уже одобренного
    (ApprovalStatus.APPROVED, Action.CASCADE_REVISE),  # каскад сверху
    (ApprovalStatus.NEEDS_REVISION, Action.OPEN_REVIEW),
    (ApprovalStatus.NEEDS_REVISION, Action.REPROPOSE_AI),
    (ApprovalStatus.REJECTED, Action.REPROPOSE_AI),
})


class InvalidTransition(Exception):
    """Попытка недопустимого перехода конечного автомата."""

    def __init__(self, current: ApprovalStatus, action: Action) -> None:
        super().__init__(
            f"Недопустимый переход согласования: {current.value} —{action.value}→"
        )
        self.current = current
        self.action = action


def next_status(current: ApprovalStatus, action: Action) -> ApprovalStatus:
    """Вернуть статус после действия или бросить InvalidTransition."""
    if (current, action) not in _ALLOWED:
        raise InvalidTransition(current, action)
    return _TARGET[action]


def can_decompose_children(parent_status: ApprovalStatus) -> bool:
    """Спуск на уровень ниже разрешён только из approved."""
    return parent_status is ApprovalStatus.APPROVED


def child_level(parent_level: Optional[PeriodLevel]) -> PeriodLevel:
    """Дочерний уровень: цель→MONTH, MONTH→WEEK, WEEK→DAY."""
    if parent_level is None:
        return PeriodLevel.MONTH
    if parent_level is PeriodLevel.MONTH:
        return PeriodLevel.WEEK
    if parent_level is PeriodLevel.WEEK:
        return PeriodLevel.DAY
    raise ValueError("У уровня DAY нет дочернего уровня")
