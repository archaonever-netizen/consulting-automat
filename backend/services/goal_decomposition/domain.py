"""Каноническая модель документа декомпозиции целей (Pydantic v2).

Это типизированный слой над JSON-документом, который хранится целиком в таблице
GoalDocument. Модели повторяют JSON Schema из спецификации (§1.3) и при этом
делают недопустимые состояния непредставимыми:

- у метрики source ∈ {user_input, derived, assumption} — тип "ai_invented"
  отсутствует структурно;
- source=derived требует derivation (формула + входы) — иначе ValidationError;
- source=assumption требует assumptionRef — иначе ValidationError;
- confidence=measured допустим только при фактическом замере
  (currentValue + measuredAt + evidence) — иначе ValidationError.

Семантические анти-обман проверки (закон сохранения, FabricatedInput,
ConstraintViolation, needsConfirmationFrom и т.п.) живут в verifier.py — он
работает на «сыром» представлении предложения модели и не полагается на эти
типы. Здесь — только структурные инварианты канонического документа.

Формат на проводе/в хранилище — camelCase JSON (как в спецификации и в I/O
контракте движка). Поля Python пишем в snake_case, алиасы в camelCase даёт
alias_generator; сериализуем через model_dump(mode="json", by_alias=True).
"""
from __future__ import annotations

from enum import Enum
from typing import Any, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic.alias_generators import to_camel

# ─────────────────────────── перечисления ───────────────────────────

class Source(str, Enum):
    """Происхождение значения метрики. 'ai_invented' невозможен по схеме."""
    USER_INPUT = "user_input"
    DERIVED = "derived"
    ASSUMPTION = "assumption"


class Confidence(str, Enum):
    """measured — есть фактический замер; остальное — степень уверенности оценки."""
    MEASURED = "measured"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class GoalStatus(str, Enum):
    DRAFT = "draft"
    DECOMPOSING = "decomposing"
    ACTIVE = "active"
    COMPLETED = "completed"
    ARCHIVED = "archived"


class PeriodLevel(str, Enum):
    MONTH = "MONTH"
    WEEK = "WEEK"
    DAY = "DAY"


class ApprovalStatus(str, Enum):
    DRAFT = "draft"
    PROPOSED_BY_AI = "proposed_by_ai"
    UNDER_REVIEW = "under_review"
    APPROVED = "approved"
    REJECTED = "rejected"
    NEEDS_REVISION = "needs_revision"


class ProposedBy(str, Enum):
    AI = "ai"
    HUMAN = "human"


class AssumptionStatus(str, Enum):
    UNCONFIRMED = "unconfirmed"
    CONFIRMED = "confirmed"
    REJECTED = "rejected"


class ConstraintType(str, Enum):
    BUDGET = "budget"
    LEGAL = "legal"
    MARKET = "market"
    DEPENDENCY = "dependency"
    CAPACITY = "capacity"
    TIME = "time"


class ConstraintSource(str, Enum):
    USER_INPUT = "user_input"
    ASSUMPTION = "assumption"


class MilestoneStatus(str, Enum):
    PLANNED = "planned"
    IN_PROGRESS = "in_progress"
    DONE = "done"
    BLOCKED = "blocked"


class ActorKind(str, Enum):
    HUMAN = "human"
    AI = "ai"


class ChangeAction(str, Enum):
    CREATE = "create"
    UPDATE = "update"
    APPROVE = "approve"
    REJECT = "reject"
    RECALCULATE = "recalculate"
    CONFIRM_ASSUMPTION = "confirm_assumption"


# ─────────────────────────── базовая модель ───────────────────────────

class _Base(BaseModel):
    """Общая конфигурация: camelCase-алиасы, заполнение и по имени поля.

    extra='forbid' — канонический документ строим мы сами уже после
    верификации, поэтому посторонние ключи здесь означают ошибку, а не вход
    «как пришло от модели» (для сырого входа есть отдельный лояльный слой).
    """
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="forbid",
        use_enum_values=False,
    )


# ─────────────────────────── сущности ───────────────────────────

class Derivation(_Base):
    """Обоснование вычисленного значения: человекочитаемая формула + входы."""
    formula: str
    inputs: list[str] = Field(default_factory=list)


class Metric(_Base):
    """Измеримый параметр со значением, единицей и обязательным происхождением."""
    id: str
    name: str
    unit: str
    target_value: Optional[float] = None
    current_value: Optional[float] = Field(default=None, description="Фактическое значение")
    measured_at: Optional[str] = None
    source: Source
    derivation: Optional[Derivation] = None
    assumption_ref: Optional[str] = None
    confidence: Optional[Confidence] = None
    evidence: Optional[str] = None

    @model_validator(mode="after")
    def _check_origin(self) -> "Metric":
        # derived обязан нести derivation (формула + входы)
        if self.source is Source.DERIVED and self.derivation is None:
            raise ValueError(
                f"Метрика '{self.id}': source=derived требует derivation (формула + входы)"
            )
        # assumption обязан ссылаться на объект допущения
        if self.source is Source.ASSUMPTION and not (self.assumption_ref or "").strip():
            raise ValueError(
                f"Метрика '{self.id}': source=assumption требует непустой assumptionRef"
            )
        # measured допустим только при фактическом замере
        if self.confidence is Confidence.MEASURED:
            has_measure = (
                self.current_value is not None
                and bool(self.measured_at)
                and bool((self.evidence or "").strip())
            )
            if not has_measure:
                raise ValueError(
                    f"Метрика '{self.id}': confidence=measured требует "
                    "currentValue + measuredAt + evidence"
                )
        return self


class Assumption(_Base):
    """Явное допущение с указанием, кто должен его подтвердить."""
    id: str
    statement: str
    assumed_value: Union[float, str]
    unit: Optional[str] = None
    basis: Optional[str] = None
    needs_confirmation_from: Optional[str] = None
    impact: list[str] = Field(default_factory=list)
    status: AssumptionStatus


class DataGap(_Base):
    """Недостающий измеримый параметр, который требуется от пользователя."""
    id: str
    required_parameter: str
    expected_unit: Optional[str] = None
    why_needed: Optional[str] = None
    suggested_source: Optional[str] = None
    blocks_decomposition: bool


class Constraint(_Base):
    """Жёсткое или мягкое ограничение (бюджет, закон, рынок, зависимость…)."""
    id: str
    type: ConstraintType
    description: str
    value: Optional[Union[float, str]] = None
    unit: Optional[str] = None
    source: Optional[ConstraintSource] = None
    hard: Optional[bool] = None


class Milestone(_Base):
    """Веха внутри периода с возможными зависимостями (dependsOn)."""
    title: str
    due_date: str
    status: MilestoneStatus
    depends_on: list[str] = Field(default_factory=list)


class DateRange(_Base):
    """Интервал дат периода. Поля 'from'/'to' — зарезервированные слова Python."""
    range_from: str = Field(alias="from")
    range_to: str = Field(alias="to")


class ApprovalRecord(_Base):
    """Состояние согласования узла (конечный автомат, см. §4.1)."""
    status: ApprovalStatus
    proposed_by: ProposedBy
    reviewed_by: Optional[str] = None
    decided_at: Optional[str] = None
    comment: Optional[str] = None


class Actor(_Base):
    """Автор изменения: человек или ИИ с версией."""
    kind: ActorKind
    ref: str


class ChangeLogEntry(_Base):
    """Запись аудита: кто/когда/что/почему изменил."""
    id: str
    timestamp: str
    actor: Actor
    entity_ref: str
    action: ChangeAction
    field: Optional[str] = None
    old_value: Any = None
    new_value: Any = None
    reason: Optional[str] = None
    triggered_recalculation: Optional[bool] = None


class Period(_Base):
    """Обобщённый узел декомпозиции (MONTH / WEEK / DAY); образует дерево."""
    id: str
    level: PeriodLevel
    index: int = Field(ge=1)
    parent_id: Optional[str] = Field(default=None, description="null для месяцев (родитель — цель)")
    goal_id: Optional[str] = None
    date_range: DateRange
    allocated_metrics: list[Metric] = Field(default_factory=list)
    milestones: list[Milestone] = Field(default_factory=list)
    assumptions: list[Assumption] = Field(default_factory=list)
    data_gaps: list[DataGap] = Field(default_factory=list)
    approval: ApprovalRecord


class Goal(_Base):
    """Корневая цель с финальными измеримыми параметрами и ограничениями."""
    id: str
    title: str
    description: Optional[str] = None
    context: Optional[dict[str, Union[str, int, float, bool]]] = None
    start_date: str
    deadline: str
    target_metrics: list[Metric] = Field(min_length=1)
    constraints: list[Constraint] = Field(default_factory=list)
    assumptions: list[Assumption] = Field(default_factory=list)
    data_gaps: list[DataGap] = Field(default_factory=list)
    status: GoalStatus


class GoalDecompositionDocument(_Base):
    """Корневой документ: цель + дерево периодов + журнал аудита."""
    schema_version: Literal["1.0.0"] = "1.0.0"
    goal: Goal
    periods: list[Period] = Field(default_factory=list)
    change_log: list[ChangeLogEntry] = Field(default_factory=list)

    def to_storage(self) -> dict[str, Any]:
        """JSON-совместимый словарь (camelCase) для колонки GoalDocument.document."""
        return self.model_dump(mode="json", by_alias=True)

    @classmethod
    def from_storage(cls, data: dict[str, Any]) -> "GoalDecompositionDocument":
        """Восстановить документ из хранилища (принимает camelCase-ключи)."""
        return cls.model_validate(data)
