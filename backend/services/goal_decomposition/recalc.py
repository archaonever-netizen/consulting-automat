"""Каскадный пересчёт с сохранением ручных правок (фаза 4, спецификация §4.3).

Принцип: пересчёт ПРЕДЛАГАЕТ новое разбиение, но ручные правки человека
(source=user_input) не затираются молча — они сохраняются, а расхождение с
предложением показывается диффом «было → стало». Затронутые approved-узлы
переходят в needs_revision.

Модуль чистый: оперирует доменными моделями, без БД/сети/времени.
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from typing import Optional

from .domain import ApprovalStatus, GoalDecompositionDocument, Period, Source


@dataclass(frozen=True)
class MetricDiff:
    """Разница по метрике при пересчёте.

    preserved=True — предложение ИИ отличалось, но сохранена ручная правка
    человека (oldValue), а newValue — то, что предлагал ИИ (отклонено в пользу
    ручного). preserved=False — значение обновлено предложением ИИ.
    """
    period_id: str
    metric_id: str
    field: str
    old_value: Optional[float]
    new_value: Optional[float]
    preserved: bool


def descendants(doc: GoalDecompositionDocument, parent_id: Optional[str]) -> list[Period]:
    """Все потомки узла. parent_id=None — корень (цель), потомки = все периоды."""
    if parent_id is None:
        return list(doc.periods)
    children_of: dict[Optional[str], list[Period]] = defaultdict(list)
    for p in doc.periods:
        children_of[p.parent_id].append(p)
    result: list[Period] = []
    stack: list[Period] = list(children_of.get(parent_id, []))
    while stack:
        node = stack.pop()
        result.append(node)
        stack.extend(children_of.get(node.id, []))
    return result


def cascade_mark_needs_revision(
    doc: GoalDecompositionDocument, parent_id: Optional[str]
) -> list[str]:
    """Перевести approved-потомков узла в needs_revision; вернуть их id."""
    affected: list[str] = []
    for node in descendants(doc, parent_id):
        if node.approval.status is ApprovalStatus.APPROVED:
            node.approval.status = ApprovalStatus.NEEDS_REVISION
            affected.append(node.id)
    return affected


def merge_children(
    existing: list[Period], proposed: list[Period]
) -> tuple[list[Period], list[MetricDiff]]:
    """Слить предложенные периоды с существующими, сохраняя ручные правки.

    Сопоставление по index. Для каждой метрики: если в существующем периоде она
    помечена source=user_input — оставляем человеческое значение (и фиксируем
    дифф, если ИИ предлагал иное); иначе берём предложенное (дифф при изменении).
    """
    by_index = {p.index: p for p in existing}
    merged: list[Period] = []
    diffs: list[MetricDiff] = []

    for prop in proposed:
        old = by_index.get(prop.index)
        old_metrics = {m.id: m for m in old.allocated_metrics} if old else {}
        new_metrics = []
        for pm in prop.allocated_metrics:
            om = old_metrics.get(pm.id)
            if om is not None and om.source is Source.USER_INPUT:
                new_metrics.append(om.model_copy(deep=True))
                if om.target_value != pm.target_value:
                    diffs.append(MetricDiff(
                        period_id=(old.id if old else prop.id), metric_id=pm.id,
                        field="targetValue", old_value=om.target_value,
                        new_value=pm.target_value, preserved=True,
                    ))
            else:
                new_metrics.append(pm.model_copy(deep=True))
                old_val = om.target_value if om is not None else None
                if old_val != pm.target_value:
                    diffs.append(MetricDiff(
                        period_id=(old.id if old else prop.id), metric_id=pm.id,
                        field="targetValue", old_value=old_val,
                        new_value=pm.target_value, preserved=False,
                    ))
        merged.append(prop.model_copy(update={
            "id": old.id if old else prop.id,
            "allocated_metrics": new_metrics,
        }))

    return merged, diffs
