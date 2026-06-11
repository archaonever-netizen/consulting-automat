"""Детерминированный анти-обман верификатор (фаза 2).

Несущая защита фреймворка — не «просьба к модели не врать», а структурные
инварианты + этот независимый валидатор, который прогоняется на каждом
предложении ДО показа человеку. Если хоть одна проверка падает — предложение
не публикуется (движок фазы 3 повторяет вызов с этим списком ошибок).

Модуль чистый и детерминированный: без сети, без БД, без времени/случайности.
Работает на «сыром» представлении (raw.py), которое способно выразить
недопустимые состояния.

Проверки (см. спецификацию §3):
1. Закон сохранения       → ConservationError
2. Учёт всех метрик цели  → UnaccountedMetric (метрика родителя не должна молча
                            потеряться при декомпозиции)
3. Происхождение числа    → MissingDerivation / OrphanAssumptionValue / FabricatedInput
4. Жёсткие ограничения    → ConstraintViolation (kind="bound")
   и зависимости вех      → ConstraintViolation (kind="dependency")
5. Честная уверенность    → FakeMeasurement

Про закон сохранения: для каждой метрики родителя с числовым targetValue
суммируем одноимённые (по id) метрики детей и сверяем сумму с родителем
(± явный буфер parent.buffers[id]). Метрики, которые ни один ребёнок не несёт,
закон сохранения пропускает — но их ловит проверка учёта (UnaccountedMetric):
каждая метрика родителя обязана присутствовать хотя бы у одного ребёнка.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, ClassVar, Mapping, Optional, Union

from .raw import RawAssumption, RawMetric, RawNode

# Допуск на арифметику с плавающей точкой при сравнении сумм.
EPS = 1e-9

VALID_SOURCES = frozenset({"user_input", "derived", "assumption"})


# ─────────────────────────── типы ошибок ───────────────────────────

@dataclass(frozen=True)
class ConservationError:
    """Закон сохранения нарушен.

    kind=flow     — Σ(дети.targetValue) ≠ родитель (вне буфера).
    kind=endpoint — значение в финальном периоде ≠ цель (вне буфера); по детям
                    такая метрика НЕ суммируется.
    """
    metric_id: str
    expected: float
    got: float
    kind: str = "flow"
    code: ClassVar[str] = "ConservationError"

    @property
    def message(self) -> str:
        if self.kind == "endpoint":
            return (
                f"Метрика '{self.metric_id}' (endpoint): значение в финальном периоде = "
                f"{self.got}, а цель = {self.expected}"
            )
        return (
            f"Закон сохранения нарушен для метрики '{self.metric_id}': "
            f"сумма по детям = {self.got}, ожидалось {self.expected}"
        )


@dataclass(frozen=True)
class UnaccountedMetric:
    """Метрика родителя не появилась ни у одного ребёнка — цель тихо потеряна."""
    metric_id: str
    code: ClassVar[str] = "UnaccountedMetric"

    @property
    def message(self) -> str:
        return (
            f"Целевая метрика '{self.metric_id}' не учтена ни в одном дочернем "
            "периоде — при декомпозиции цель не должна теряться"
        )


@dataclass(frozen=True)
class MissingDerivation:
    """source=derived без формулы/входов."""
    node_id: str
    metric_id: str
    code: ClassVar[str] = "MissingDerivation"

    @property
    def message(self) -> str:
        return (
            f"Узел '{self.node_id}', метрика '{self.metric_id}': source=derived, "
            "но нет derivation с формулой и входами"
        )


@dataclass(frozen=True)
class FabricatedInput:
    """user_input, которого нет в dataset (или недопустимый source)."""
    node_id: str
    metric_id: str
    reason: str
    code: ClassVar[str] = "FabricatedInput"

    @property
    def message(self) -> str:
        return f"Узел '{self.node_id}', метрика '{self.metric_id}': {self.reason}"


@dataclass(frozen=True)
class ConstraintViolation:
    """Нарушено жёсткое ограничение (kind=bound) или зависимость вех (kind=dependency)."""
    constraint_id: str
    kind: str
    detail: str
    code: ClassVar[str] = "ConstraintViolation"

    @property
    def message(self) -> str:
        return f"Нарушение ограничения '{self.constraint_id}' ({self.kind}): {self.detail}"


@dataclass(frozen=True)
class FakeMeasurement:
    """confidence=measured без фактического замера (currentValue+measuredAt+evidence)."""
    node_id: str
    metric_id: str
    code: ClassVar[str] = "FakeMeasurement"

    @property
    def message(self) -> str:
        return (
            f"Узел '{self.node_id}', метрика '{self.metric_id}': confidence=measured "
            "без фактического замера (нужны currentValue + measuredAt + evidence)"
        )


@dataclass(frozen=True)
class OrphanAssumptionValue:
    """source=assumption без разрешимого допущения с needsConfirmationFrom."""
    node_id: str
    metric_id: str
    reason: str
    code: ClassVar[str] = "OrphanAssumptionValue"

    @property
    def message(self) -> str:
        return f"Узел '{self.node_id}', метрика '{self.metric_id}': {self.reason}"


VerificationError = Union[
    ConservationError,
    UnaccountedMetric,
    MissingDerivation,
    FabricatedInput,
    ConstraintViolation,
    FakeMeasurement,
    OrphanAssumptionValue,
]


@dataclass(frozen=True)
class Report:
    """Итог проверки: ok=True только при пустом списке ошибок."""
    ok: bool
    errors: tuple[VerificationError, ...] = ()

    @classmethod
    def from_errors(cls, errors: list[VerificationError]) -> "Report":
        return cls(ok=not errors, errors=tuple(errors))

    def to_feedback(self) -> str:
        """Человекочитаемый список ошибок для повторного запроса к модели."""
        if not self.errors:
            return ""
        lines = [f"- [{e.code}] {e.message}" for e in self.errors]
        header = "Верификатор отклонил предложение. Исправь и верни валидный JSON:\n"
        return header + "\n".join(lines)

    def code_counts(self) -> dict[str, int]:
        """Счётчик ошибок по типам (без значений) — безопасно для логов."""
        counts: dict[str, int] = {}
        for e in self.errors:
            counts[e.code] = counts.get(e.code, 0) + 1
        return counts

    def code_summary(self) -> str:
        """Сводка только из имён типов ошибок и их числа — без секретов/значений."""
        return ", ".join(f"{code}×{n}" for code, n in sorted(self.code_counts().items()))


# ─────────────────────────── публичная функция ───────────────────────────

def verify(
    parent: RawNode,
    children: list[RawNode],
    *,
    dataset: Optional[Mapping[str, Any]] = None,
    assumptions: Optional[list[RawAssumption]] = None,
) -> Report:
    """Проверить предложение разбиения parent → children.

    dataset — единственный источник истины для source=user_input (если None,
    проверка FabricatedInput по dataset пропускается). assumptions — известные
    объекты допущений (в дополнение к тем, что лежат в узлах) для разрешения
    assumptionRef.
    """
    errors: list[VerificationError] = []
    known_ids, confirmable_ids = _collect_assumptions(parent, children, assumptions)
    # id метрик родителя: их доли по периодам обязаны быть derived/assumption,
    # никогда user_input (железное правило, не зависит от содержимого dataset).
    parent_ids = {m.id for m in parent.metrics if m.id}

    errors.extend(_check_conservation(parent, children))
    errors.extend(_check_accounting(parent, children))

    for child in children:
        for metric in child.metrics:
            errors.extend(
                _check_origin(child, metric, dataset, known_ids, confirmable_ids, parent_ids)
            )
            errors.extend(_check_measurement(child, metric))

    errors.extend(_check_dependencies(children))
    errors.extend(_check_hard_bounds(parent, children))

    return Report.from_errors(errors)


# ─────────────────────────── проверки ───────────────────────────

def _check_conservation(parent: RawNode, children: list[RawNode]) -> list[VerificationError]:
    """Закон сохранения с учётом типа агрегации метрики родителя.

    flow      — Σ значений по детям == родитель (± буфер).
    endpoint  — значение в ФИНАЛЬНОМ периоде (max index среди носителей) == цель
                (± буфер); по детям не суммируется. Промежуточная траектория НЕ
                проверяется жёстко (мягко, без ложных ошибок) — это допускает и
                рост, и убывание к цели.

    Тип агрегации берётся у метрики РОДИТЕЛЯ (задан человеком на цели и
    наследуется вниз движком), а не у детей — модель его не выдумывает.
    """
    errors: list[VerificationError] = []
    for pm in parent.metrics:
        if pm.id is None or pm.target_value is None:
            continue
        matched = [(child, m) for child in children for m in child.metrics if m.id == pm.id]
        if not matched:
            continue
        tolerance = parent.buffers.get(pm.id, 0.0) + EPS

        if (pm.aggregation or "flow").lower() == "endpoint":
            final_child, final_metric = max(
                matched, key=lambda cm: cm[0].index if cm[0].index is not None else -1
            )
            got = final_metric.target_value or 0.0
            if abs(got - pm.target_value) > tolerance:
                errors.append(ConservationError(
                    metric_id=pm.id, expected=pm.target_value, got=got, kind="endpoint",
                ))
        else:
            total = sum((m.target_value or 0.0) for _, m in matched)
            if abs(total - pm.target_value) > tolerance:
                errors.append(ConservationError(
                    metric_id=pm.id, expected=pm.target_value, got=total, kind="flow",
                ))
    return errors


def _check_accounting(parent: RawNode, children: list[RawNode]) -> list[VerificationError]:
    """Каждая метрика родителя обязана присутствовать хотя бы у одного ребёнка.

    Дополняет закон сохранения: тот пропускает нераспределённые метрики, а эта
    проверка гарантирует, что целевая метрика не исчезнет молча при разбиении.
    """
    errors: list[VerificationError] = []
    child_metric_ids = {m.id for child in children for m in child.metrics if m.id}
    for pm in parent.metrics:
        if pm.id is not None and pm.id not in child_metric_ids:
            errors.append(UnaccountedMetric(metric_id=pm.id))
    return errors


def _check_origin(
    child: RawNode,
    metric: RawMetric,
    dataset: Optional[Mapping[str, Any]],
    known_ids: set[str],
    confirmable_ids: set[str],
    parent_ids: set[str],
) -> list[VerificationError]:
    node_id = child.id or "?"
    mid = metric.id or "?"
    src = metric.source

    if src not in VALID_SOURCES:
        return [FabricatedInput(node_id, mid, reason=f"недопустимый source: {src!r}")]

    # Железное правило: доля метрики родителя по периоду — это расчёт, а не «данные».
    # Запрещаем user_input ДАЖЕ если значение есть в dataset (после прокидывания
    # targetMetrics цели в dataset это единственная гарантия).
    if src == "user_input" and metric.id in parent_ids:
        return [FabricatedInput(
            node_id, mid,
            reason="доля метрики родителя — derived/assumption, не user_input",
        )]

    if src == "derived":
        d = metric.derivation
        if d is None or not (d.formula and d.formula.strip()) or not d.inputs:
            return [MissingDerivation(node_id, mid)]
        return []

    if src == "assumption":
        ref = (metric.assumption_ref or "").strip()
        if not ref:
            return [OrphanAssumptionValue(
                node_id, mid, reason="source=assumption без assumptionRef",
            )]
        if ref not in known_ids:
            return [OrphanAssumptionValue(
                node_id, mid, reason=f"assumptionRef '{ref}' не разрешается в известные допущения"
            )]
        if ref not in confirmable_ids:
            return [OrphanAssumptionValue(
                node_id, mid, reason=f"у допущения '{ref}' не указан needsConfirmationFrom"
            )]
        return []

    # src == "user_input"
    if dataset is not None:
        ok, reason = _user_input_in_dataset(metric, dataset)
        if not ok:
            return [FabricatedInput(node_id, mid, reason=reason)]
    return []


def _user_input_in_dataset(metric: RawMetric, dataset: Mapping[str, Any]) -> tuple[bool, str]:
    key: Optional[str] = None
    if metric.id is not None and metric.id in dataset:
        key = metric.id
    elif metric.name is not None and metric.name in dataset:
        key = metric.name
    if key is None:
        return False, "помечено source=user_input, но отсутствует в dataset"

    claimed = metric.target_value if metric.target_value is not None else metric.current_value
    value = dataset[key]
    if isinstance(value, (int, float)) and isinstance(claimed, (int, float)):
        if abs(float(value) - float(claimed)) > EPS:
            return False, f"user_input расходится с dataset: {claimed} ≠ {value}"
    return True, ""


def _check_measurement(child: RawNode, metric: RawMetric) -> list[VerificationError]:
    if metric.confidence != "measured":
        return []
    has_measure = (
        metric.current_value is not None
        and bool(metric.measured_at)
        and bool(metric.evidence and metric.evidence.strip())
    )
    if not has_measure:
        return [FakeMeasurement(child.id or "?", metric.id or "?")]
    return []


def _check_dependencies(children: list[RawNode]) -> list[VerificationError]:
    """Зависимости вех (dependsOn ссылается на title) должны соблюдать порядок."""
    errors: list[VerificationError] = []
    all_milestones = {ms.title: ms for child in children for ms in child.milestones if ms.title}

    for child in children:
        for ms in child.milestones:
            for dep_title in ms.depends_on:
                dep = all_milestones.get(dep_title)
                cid = f"dep:{dep_title}"
                if dep is None:
                    errors.append(ConstraintViolation(
                        cid, "dependency",
                        f"веха '{ms.title}' зависит от ненайденной вехи '{dep_title}'",
                    ))
                    continue
                if ms.due_date and dep.due_date and dep.due_date > ms.due_date:
                    errors.append(ConstraintViolation(
                        cid, "dependency",
                        f"веха '{ms.title}' ({ms.due_date}) запланирована раньше своей "
                        f"зависимости '{dep_title}' ({dep.due_date})",
                    ))
                if ms.status == "done" and dep.status != "done":
                    errors.append(ConstraintViolation(
                        cid, "dependency",
                        f"веха '{ms.title}' завершена, а её зависимость '{dep_title}' — нет",
                    ))
    return errors


def _check_hard_bounds(parent: RawNode, children: list[RawNode]) -> list[VerificationError]:
    """Жёсткий числовой лимит: сумма метрик детей в той же единице ≤ value.

    Конвенция: ограничение с hard=true, числовым value и непустым unit задаёт
    верхнюю границу на суммарный объём всех метрик детей с тем же unit (например,
    бюджет ФОТ в ₽/мес). Это детерминированная, осознанно консервативная оценка.
    """
    errors: list[VerificationError] = []
    for cons in parent.constraints:
        if not cons.hard or cons.unit is None or not isinstance(cons.value, (int, float)):
            continue
        total = sum(
            (m.target_value or 0.0)
            for child in children
            for m in child.metrics
            if m.unit == cons.unit
        )
        if total > float(cons.value) + EPS:
            errors.append(ConstraintViolation(
                cons.id or cons.type or "constraint", "bound",
                f"сумма метрик в '{cons.unit}' = {total} превышает жёсткий лимит {cons.value}",
            ))
    return errors


def _collect_assumptions(
    parent: RawNode,
    children: list[RawNode],
    extra: Optional[list[RawAssumption]],
) -> tuple[set[str], set[str]]:
    """Собрать id известных допущений и подмножество с needsConfirmationFrom."""
    known: set[str] = set()
    confirmable: set[str] = set()
    pools: list[list[RawAssumption]] = [parent.assumptions, *[c.assumptions for c in children]]
    if extra:
        pools.append(extra)
    for pool in pools:
        for a in pool:
            if a.id:
                known.add(a.id)
                if a.needs_confirmation_from and a.needs_confirmation_from.strip():
                    confirmable.add(a.id)
    return known, confirmable
