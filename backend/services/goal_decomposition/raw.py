"""«Сырое» (лояльное) представление предложения модели для верификатора.

Канонические модели в domain.py делают недопустимые состояния непредставимыми —
поэтому верификатор не может работать на них: на них нельзя сконструировать
«выдуманное число» или «derived без формулы», а именно это он обязан ловить.

Здесь модели нарочно лояльные: все поля опциональны, нет кросс-поле́вых
валидаторов, посторонние ключи игнорируются (extra="ignore"). Это то, «как
пришло от модели», ещё не заверенное. После прохождения верификатора движок
(фаза 3) собирает из этого канонические domain-модели.

RawNode — обобщённый узел: для родителя-цели metrics = targetMetrics, для
родителя-периода metrics = allocatedMetrics; для ребёнка metrics =
allocatedMetrics. Маппинг делает вызывающая сторона.
"""
from __future__ import annotations

from typing import Any, Optional, Union

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class _Raw(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="ignore",
    )


class RawDerivation(_Raw):
    formula: Optional[str] = None
    inputs: list[str] = Field(default_factory=list)


class RawMetric(_Raw):
    id: Optional[str] = None
    name: Optional[str] = None
    unit: Optional[str] = None
    target_value: Optional[float] = None
    current_value: Optional[float] = None
    measured_at: Optional[str] = None
    source: Optional[str] = None
    derivation: Optional[RawDerivation] = None
    assumption_ref: Optional[str] = None
    confidence: Optional[str] = None
    evidence: Optional[str] = None


class RawConstraint(_Raw):
    id: Optional[str] = None
    type: Optional[str] = None
    description: Optional[str] = None
    value: Optional[Union[float, str]] = None
    unit: Optional[str] = None
    source: Optional[str] = None
    hard: Optional[bool] = None


class RawMilestone(_Raw):
    title: Optional[str] = None
    due_date: Optional[str] = None
    status: Optional[str] = None
    depends_on: list[str] = Field(default_factory=list)


class RawAssumption(_Raw):
    id: Optional[str] = None
    statement: Optional[str] = None
    assumed_value: Optional[Union[float, str]] = None
    unit: Optional[str] = None
    basis: Optional[str] = None
    needs_confirmation_from: Optional[str] = None
    impact: list[str] = Field(default_factory=list)
    status: Optional[str] = None


class RawDataGap(_Raw):
    id: Optional[str] = None
    required_parameter: Optional[str] = None
    expected_unit: Optional[str] = None
    why_needed: Optional[str] = None
    suggested_source: Optional[str] = None
    blocks_decomposition: Optional[bool] = None


class RawNode(_Raw):
    """Узел, на котором работает верификатор (родитель или ребёнок).

    buffers — явные допуски закона сохранения по id метрики (абсолютное
    отклонение). Это не часть JSON-схемы документа, а вход верификатора:
    интегратор задаёт резерв осознанно (см. заметку про буфер в системном
    промпте). Пусто = строгое равенство (с точностью до эпсилон float).
    """
    id: Optional[str] = None
    metrics: list[RawMetric] = Field(default_factory=list)
    constraints: list[RawConstraint] = Field(default_factory=list)
    milestones: list[RawMilestone] = Field(default_factory=list)
    assumptions: list[RawAssumption] = Field(default_factory=list)
    buffers: dict[str, float] = Field(default_factory=dict)


# ─────────── I/O-контракт движка (claude-system-prompt.md, ФОРМАТ ВЫХОДА) ───────────
# Лояльные модели ответа модели: разбираем то, «как пришло», до верификации.

class ProposalChild(_Raw):
    """Дочерний период из ответа модели (allocatedMetrics + вехи)."""
    index: Optional[int] = None
    date_range: Optional[dict[str, Any]] = None
    allocated_metrics: list[RawMetric] = Field(default_factory=list)
    milestones: list[RawMilestone] = Field(default_factory=list)


class ProposalAlternative(_Raw):
    """Альтернативное разбиение с явным трейд-оффом (при request=alternatives)."""
    label: Optional[str] = None
    tradeoff: Optional[str] = None
    children: list[ProposalChild] = Field(default_factory=list)
    assumptions: list[RawAssumption] = Field(default_factory=list)


class ProposalVerification(_Raw):
    conservation_ok: Optional[bool] = None
    notes: Optional[str] = None


class ProposalOutput(_Raw):
    """Полный ответ движка одного уровня."""
    status: Optional[str] = None
    level: Optional[str] = None
    children: list[ProposalChild] = Field(default_factory=list)
    assumptions: list[RawAssumption] = Field(default_factory=list)
    data_gaps: list[RawDataGap] = Field(default_factory=list)
    alternatives: list[ProposalAlternative] = Field(default_factory=list)
    verification: Optional[ProposalVerification] = None
