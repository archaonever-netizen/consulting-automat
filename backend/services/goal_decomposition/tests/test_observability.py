"""Наблюдаемость движка: факт блокировки логируется, секреты не утекают.

Проверяем, что в логах есть тип ошибки верификатора и нет ни значения из
dataset, ни сырого ответа модели (маркер trace-9999), ни системного промпта.
"""
import json
import logging

from backend.services.goal_decomposition.engine import decompose

GOAL = {
    "id": "g1", "title": "Цель", "startDate": "2026-07-01", "deadline": "2026-12-31",
    "targetMetrics": [{"id": "headcount", "name": "Найм", "unit": "чел.",
                       "targetValue": 10, "source": "user_input"}],
    "constraints": [], "status": "decomposing",
}
# В dataset намеренно лежит «секрет» — он не должен попасть в логи.
DATASET = {"headcount": 10, "secret_budget": "SECRET-XYZ"}


def _metric(value):
    return {"id": "headcount", "name": "Найм", "unit": "чел.", "targetValue": value,
            "source": "derived", "derivation": {"formula": "x", "inputs": ["headcount"]},
            "confidence": "medium"}


def _child(index, value):
    return {"index": index, "dateRange": {"from": "2026-07-0{}".format(index), "to": "2026-07-28"},
            "allocatedMetrics": [_metric(value)], "milestones": []}


def _proposal(split):
    return json.dumps({
        "status": "proposed", "level": "MONTH",
        "children": [_child(i, v) for i, v in split],
        "assumptions": [], "dataGaps": [], "alternatives": [],
        # маркер «сырого ответа модели» — в логах его быть не должно
        "verification": {"conservationOk": True, "notes": "trace-9999"},
    }, ensure_ascii=False)


_BAD = _proposal([(1, 6), (2, 3)])   # сумма 9 ≠ 10 → ConservationError
_GOOD = _proposal([(1, 6), (2, 4)])  # сумма 10


class FakeResponder:
    def __init__(self, *responses):
        self.responses = list(responses)
        self.calls = 0

    async def __call__(self, system, user):
        self.calls += 1
        return self.responses[min(self.calls - 1, len(self.responses) - 1)]


async def test_verifier_block_logged_without_secrets(caplog):
    fake = FakeResponder(_BAD)
    with caplog.at_level(logging.INFO, logger="goal_decomposition.engine"):
        result = await decompose(level="MONTH", goal=GOAL, dataset=DATASET,
                                 responder=fake, max_retries=1)
    assert result.status == "error"
    text = caplog.text
    assert "верификатор отклонил" in text
    assert "ConservationError" in text          # тип ошибки залогирован
    assert "не удалось получить валидное предложение" in text
    # секреты и сырой вывод модели НЕ утекли в лог
    assert "SECRET-XYZ" not in text
    assert "trace-9999" not in text
    assert "детерминированный движок" not in text  # фрагмент системного промпта


async def test_success_is_logged(caplog):
    fake = FakeResponder(_GOOD)
    with caplog.at_level(logging.INFO, logger="goal_decomposition.engine"):
        result = await decompose(level="MONTH", goal=GOAL, dataset=DATASET, responder=fake)
    assert result.status == "proposed"
    assert "предложение принято" in caplog.text
    assert "SECRET-XYZ" not in caplog.text


async def test_blocked_is_logged_count_only(caplog):
    blocked = json.dumps({
        "status": "blocked", "level": "MONTH", "children": [], "assumptions": [],
        "dataGaps": [{"id": "dg1", "requiredParameter": "Бюджет ФОТ",
                      "expectedUnit": "₽/мес", "blocksDecomposition": True}],
        "alternatives": [], "verification": {"conservationOk": False, "notes": ""},
    }, ensure_ascii=False)
    fake = FakeResponder(blocked)
    with caplog.at_level(logging.INFO, logger="goal_decomposition.engine"):
        result = await decompose(level="MONTH", goal=GOAL, dataset=DATASET, responder=fake)
    assert result.status == "blocked"
    assert "blocked" in caplog.text
    # содержимое пробела (название параметра) в лог не пишем
    assert "Бюджет ФОТ" not in caplog.text
