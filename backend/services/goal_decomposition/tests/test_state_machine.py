"""Тесты конечного автомата согласования."""
import pytest

from backend.services.goal_decomposition.domain import ApprovalStatus, PeriodLevel
from backend.services.goal_decomposition.state_machine import (
    Action,
    InvalidTransition,
    can_decompose_children,
    child_level,
    next_status,
)


def test_happy_path_transitions():
    assert next_status(ApprovalStatus.DRAFT, Action.PROPOSE_AI) is ApprovalStatus.PROPOSED_BY_AI
    assert next_status(ApprovalStatus.PROPOSED_BY_AI, Action.OPEN_REVIEW) is ApprovalStatus.UNDER_REVIEW
    assert next_status(ApprovalStatus.UNDER_REVIEW, Action.APPROVE) is ApprovalStatus.APPROVED


def test_edit_and_reject():
    assert next_status(ApprovalStatus.UNDER_REVIEW, Action.EDIT) is ApprovalStatus.NEEDS_REVISION
    assert next_status(ApprovalStatus.UNDER_REVIEW, Action.REJECT) is ApprovalStatus.REJECTED
    assert next_status(ApprovalStatus.NEEDS_REVISION, Action.REPROPOSE_AI) is ApprovalStatus.PROPOSED_BY_AI


def test_cascade_from_approved():
    assert next_status(ApprovalStatus.APPROVED, Action.CASCADE_REVISE) is ApprovalStatus.NEEDS_REVISION


def test_invalid_transition_raises():
    with pytest.raises(InvalidTransition):
        next_status(ApprovalStatus.DRAFT, Action.APPROVE)
    with pytest.raises(InvalidTransition):
        next_status(ApprovalStatus.APPROVED, Action.APPROVE)


def test_descend_only_from_approved():
    assert can_decompose_children(ApprovalStatus.APPROVED) is True
    for s in (ApprovalStatus.DRAFT, ApprovalStatus.PROPOSED_BY_AI,
              ApprovalStatus.UNDER_REVIEW, ApprovalStatus.NEEDS_REVISION,
              ApprovalStatus.REJECTED):
        assert can_decompose_children(s) is False


def test_child_level():
    assert child_level(None) is PeriodLevel.MONTH
    assert child_level(PeriodLevel.MONTH) is PeriodLevel.WEEK
    assert child_level(PeriodLevel.WEEK) is PeriodLevel.DAY
    with pytest.raises(ValueError):
        child_level(PeriodLevel.DAY)
