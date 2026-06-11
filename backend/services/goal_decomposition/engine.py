"""Сервис движка декомпозиции (фаза 3).

Поток одного вызова:
1. собрать user-сообщение по шаблону (prompts.build_user_message);
2. вызвать LLM (Promptra→Claude, temperature=0) и взять СЫРОЙ ТЕКСТ;
3. распарсить JSON в try/catch (при сбое — ретрай «верни только валидный JSON»);
4. разобрать в лояльный слой (ProposalOutput);
5. если blocked / есть блокирующий dataGap — вернуть blocked без чисел;
6. прогнать через детерминированный верификатор;
7. при ошибках — ретрай с приложенным списком ошибок (N в настройках, дефолт 2);
8. вернуть proposed / blocked / error.

Движок НИКОГДА не подменяет отсутствующие данные: он лишь снимает markdown и
парсит JSON; ничего не «дорисовывает». Решающий барьер — верификатор, не промпт.
"""
from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Optional

from ...core.config import get_settings
from .llm import get_decomposition_llm
from .prompts import SYSTEM_PROMPT, build_user_message, with_verifier_feedback
from .raw import (
    ProposalChild,
    ProposalOutput,
    RawAssumption,
    RawConstraint,
    RawMetric,
    RawNode,
)
from .verifier import Report, verify

# Наблюдаемость. ВАЖНО: логируем только уровень, попытку и типы ошибок верификатора.
# Никогда не пишем в лог dataset, системный промпт, user-сообщение, сырой ответ
# модели и ключи — чтобы не утекли секреты и чувствительные данные.
logger = logging.getLogger("goal_decomposition.engine")

# Принимает (system, user) → текст ответа модели. Вынесено для тестов без сети.
Responder = Callable[[str, str], Awaitable[str]]


@dataclass
class Proposal:
    """Результат декомпозиции одного уровня (готов к показу/сохранению)."""
    status: str  # "proposed" | "blocked" | "error"
    level: str
    children: list[dict[str, Any]] = field(default_factory=list)
    assumptions: list[dict[str, Any]] = field(default_factory=list)
    data_gaps: list[dict[str, Any]] = field(default_factory=list)
    alternatives: list[dict[str, Any]] = field(default_factory=list)
    notes: str = ""
    attempts: int = 0
    verifier_feedback: str = ""
    error: Optional[str] = None


async def decompose(
    *,
    level: str,
    goal: dict[str, Any],
    parent_node: Optional[dict[str, Any]] = None,
    dataset: Optional[dict[str, Any]] = None,
    constraints: Optional[list[dict[str, Any]]] = None,
    existing_assumptions: Optional[list[dict[str, Any]]] = None,
    request: str = "decompose",
    alternatives_count: int = 0,
    responder: Optional[Responder] = None,
    max_retries: Optional[int] = None,
) -> Proposal:
    """Предложить разбиение узла на уровень `level` (или альтернативы)."""
    settings = get_settings()
    retries = settings.decomposition_max_retries if max_retries is None else max_retries
    parent_node = parent_node or goal
    constraints = constraints or []
    existing_assumptions = existing_assumptions or []
    dataset = dataset or {}

    if responder is None:
        responder = _build_default_responder()

    base_user = build_user_message(
        level=level,
        goal=goal,
        parent_node=parent_node,
        dataset=dataset,
        constraints=constraints,
        existing_assumptions=existing_assumptions,
        request=request,
        alternatives_count=alternatives_count,
    )
    parent_raw = _parent_to_raw(goal, parent_node, constraints)
    existing_raw = [RawAssumption.model_validate(a) for a in existing_assumptions]

    feedback = ""
    last_problem = ""
    attempts = 0
    for attempt in range(retries + 1):
        attempts = attempt + 1
        user = with_verifier_feedback(base_user, feedback)

        try:
            text = await responder(SYSTEM_PROMPT, user)
        except Exception as exc:  # noqa: BLE001 — любая ошибка вызова LLM = управляемая
            feedback = ""  # это сбой вызова модели, а не замечание верификатора
            last_problem = f"Ошибка вызова LLM-движка: {exc}"
            # В лог — только тип ошибки (без датасета/промпта/ответа/ключей).
            logger.warning(
                "decompose level=%s: ошибка вызова LLM (попытка %d/%d): %s",
                level, attempts, retries + 1, type(exc).__name__,
            )
            continue

        try:
            data = _extract_json(text)
        except ValueError as exc:
            feedback = (
                "Верни ТОЛЬКО валидный JSON-объект по схеме "
                "(без markdown, без текста вокруг)."
            )
            last_problem = f"JSON-парсинг не удался: {exc}"
            logger.warning(
                "decompose level=%s: невалидный JSON (попытка %d/%d)",
                level, attempts, retries + 1,
            )
            continue

        out = ProposalOutput.model_validate(data)

        # Блокировка: статус blocked или есть блокирующий dataGap — числа не показываем.
        blocking = [g for g in out.data_gaps if g.blocks_decomposition]
        if (out.status or "").lower() == "blocked" or blocking:
            logger.info(
                "decompose level=%s: blocked, dataGaps=%d (блокирующих=%d)",
                level, len(out.data_gaps), len(blocking),
            )
            return Proposal(
                status="blocked",
                level=level,
                data_gaps=[g.model_dump(by_alias=True) for g in out.data_gaps],
                assumptions=[a.model_dump(by_alias=True) for a in out.assumptions],
                notes=_notes(out),
                attempts=attempts,
            )

        assumptions_raw = [*out.assumptions, *existing_raw]

        if request == "alternatives":
            verified = _verify_alternatives(parent_raw, out, dataset, assumptions_raw)
            if verified:
                logger.info(
                    "alternatives level=%s: %d вариантов прошли верификатор (попытка %d)",
                    level, len(verified), attempts,
                )
                return Proposal(
                    status="proposed",
                    level=level,
                    alternatives=verified,
                    assumptions=[a.model_dump(by_alias=True) for a in out.assumptions],
                    notes=_notes(out),
                    attempts=attempts,
                )
            feedback = (
                "Ни одна альтернатива не прошла верификатор: проверь закон сохранения, "
                "учёт всех целевых метрик и происхождение каждого числа."
            )
            last_problem = feedback
            logger.warning(
                "alternatives level=%s: ни одна не прошла верификатор (попытка %d/%d)",
                level, attempts, retries + 1,
            )
            continue

        children_raw = [_child_to_raw(c) for c in out.children]
        report = verify(parent_raw, children_raw, dataset=dataset, assumptions=assumptions_raw)
        if report.ok:
            logger.info(
                "decompose level=%s: предложение принято с попытки %d", level, attempts,
            )
            return Proposal(
                status="proposed",
                level=level,
                children=[c.model_dump(by_alias=True) for c in out.children],
                assumptions=[a.model_dump(by_alias=True) for a in out.assumptions],
                data_gaps=[g.model_dump(by_alias=True) for g in out.data_gaps],
                notes=_notes(out),
                attempts=attempts,
            )
        feedback = report.to_feedback()
        last_problem = feedback
        # Только типы ошибок — без значений/датасета/ответа модели.
        logger.warning(
            "decompose level=%s: верификатор отклонил (попытка %d/%d): %s",
            level, attempts, retries + 1, report.code_summary(),
        )

    logger.error(
        "decompose level=%s: не удалось получить валидное предложение за %d попыток",
        level, attempts,
    )
    return Proposal(
        status="error",
        level=level,
        attempts=attempts,
        verifier_feedback=feedback,
        error=last_problem or "Не удалось получить валидное предложение",
    )


# ─────────────────────────── вспомогательное ───────────────────────────

def _notes(out: ProposalOutput) -> str:
    return (out.verification.notes if out.verification else "") or ""


def _verify_alternatives(
    parent_raw: RawNode,
    out: ProposalOutput,
    dataset: dict[str, Any],
    assumptions_raw: list[RawAssumption],
) -> list[dict[str, Any]]:
    """Вернуть только альтернативы, прошедшие верификатор (жульнические отбрасываем)."""
    verified: list[dict[str, Any]] = []
    for alt in out.alternatives:
        children_raw = [_child_to_raw(c) for c in alt.children]
        report = verify(
            parent_raw, children_raw,
            dataset=dataset,
            assumptions=[*assumptions_raw, *alt.assumptions],
        )
        if report.ok:
            verified.append(alt.model_dump(by_alias=True))
    return verified


def _parent_to_raw(
    goal: dict[str, Any],
    parent_node: dict[str, Any],
    constraints: list[dict[str, Any]],
) -> RawNode:
    """Построить родительский узел верификатора из цели/узла и ограничений."""
    metrics_src = (
        parent_node.get("allocatedMetrics")
        or parent_node.get("targetMetrics")
        or goal.get("targetMetrics")
        or []
    )
    cons_src = [*(goal.get("constraints") or []), *constraints]
    buffers = parent_node.get("buffers") or goal.get("buffers") or {}
    return RawNode(
        id=parent_node.get("id") or goal.get("id"),
        metrics=[RawMetric.model_validate(m) for m in metrics_src],
        constraints=[RawConstraint.model_validate(c) for c in cons_src],
        buffers=buffers,
    )


def _child_to_raw(child: ProposalChild) -> RawNode:
    return RawNode(
        id=str(child.index) if child.index is not None else None,
        metrics=child.allocated_metrics,
        milestones=child.milestones,
    )


def _extract_json(text: str) -> dict[str, Any]:
    """Снять markdown-огорождения и распарсить ровно один JSON-объект.

    Никаких «починок» содержимого: только удаление обрамления и выбор объекта.
    При неуспехе бросает ValueError (движок уйдёт в ретрай).
    """
    s = text.strip()
    fence = re.match(r"^```(?:json)?\s*(.*?)\s*```$", s, re.DOTALL)
    if fence:
        s = fence.group(1).strip()
    try:
        data = json.loads(s)
    except json.JSONDecodeError:
        start = s.find("{")
        end = s.rfind("}")
        if start == -1 or end == -1 or end <= start:
            raise ValueError("в ответе нет JSON-объекта") from None
        data = json.loads(s[start:end + 1])  # JSONDecodeError — подкласс ValueError
    if not isinstance(data, dict):
        raise ValueError("ожидался JSON-объект верхнего уровня")
    return data


def _build_default_responder() -> Responder:
    """Реальный респондер: один экземпляр LLM на вызов decompose."""
    llm = get_decomposition_llm()

    async def _responder(system: str, user: str) -> str:
        from langchain_core.messages import HumanMessage, SystemMessage

        result = await llm.ainvoke([SystemMessage(content=system), HumanMessage(content=user)])
        content = result.content
        return content if isinstance(content, str) else str(content)

    return _responder


__all__ = ["Proposal", "Report", "Responder", "decompose"]
