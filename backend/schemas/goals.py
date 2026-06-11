"""Схемы запросов/ответов API декомпозиции целей.

Тела принимаются в camelCase (как и формат документа на фронте); поля Python —
snake_case с алиасами. Вложенные структуры (метрики, ограничения) принимаются
как dict и валидируются доменными моделями в роутах.
"""
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class _Camel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class CreateGoalRequest(_Camel):
    title: str
    description: Optional[str] = None
    start_date: str
    deadline: str
    target_metrics: list[dict[str, Any]]
    constraints: list[dict[str, Any]] = Field(default_factory=list)
    context: Optional[dict[str, Any]] = None
    dataset: dict[str, Any] = Field(default_factory=dict)


class DatasetUpdateRequest(_Camel):
    dataset: dict[str, Any]


class DecomposeRequest(_Camel):
    level: str  # MONTH | WEEK | DAY
    parent_id: Optional[str] = None


class AlternativesRequest(_Camel):
    level: str
    parent_id: Optional[str] = None
    count: int = 3


class ApproveRequest(_Camel):
    reviewed_by: Optional[str] = None
    comment: Optional[str] = None


class RejectRequest(_Camel):
    reason: str
    reviewed_by: Optional[str] = None


class MetricEditModel(_Camel):
    metric_id: str
    target_value: Optional[float] = None


class EditRequest(_Camel):
    edits: list[MetricEditModel]


class ConfirmAssumptionRequest(_Camel):
    status: str  # confirmed | rejected
    actual_value: Optional[Any] = None


class RecalculateRequest(_Camel):
    parent_id: Optional[str] = None
