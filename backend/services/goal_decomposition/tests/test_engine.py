"""Тесты движка декомпозиции с замоканным LLM (без сети).

Покрываем: успешный proposed, blocked по блокирующему dataGap, петлю ретраев на
провале верификатора (с приложением ошибок), восстановление после битого JSON,
исчерпание ретраев → error, и request=alternatives.
"""
import json

from backend.services.goal_decomposition.engine import decompose

GOAL = {
    "id": "g1",
    "title": "Подразделение в Новосибирске",
    "startDate": "2026-07-01",
    "deadline": "2026-12-31",
    "targetMetrics": [
        {"id": "headcount", "name": "Найм", "unit": "чел.", "targetValue": 10, "source": "user_input"},
    ],
    "constraints": [],
    "status": "decomposing",
}
DATASET = {"headcount": 10}


def _metric(value, mid="headcount"):
    return {
        "id": mid, "name": "Найм", "unit": "чел.", "targetValue": value,
        "source": "derived",
        "derivation": {"formula": "волна найма", "inputs": ["headcount"]},
        "confidence": "medium",
    }


def _child(index, value, dfrom, dto):
    return {
        "index": index,
        "dateRange": {"from": dfrom, "to": dto},
        "allocatedMetrics": [_metric(value)],
        "milestones": [],
    }


def _proposed(split):
    """split — список (index, value, from, to)."""
    return json.dumps({
        "status": "proposed", "level": "MONTH",
        "children": [_child(*s) for s in split],
        "assumptions": [], "dataGaps": [], "alternatives": [],
        "verification": {"conservationOk": True, "notes": "найм волной"},
    }, ensure_ascii=False)


_GOOD = _proposed([(1, 6, "2026-07-01", "2026-07-31"), (2, 4, "2026-08-01", "2026-08-31")])
_BAD_SUM = _proposed([(1, 6, "2026-07-01", "2026-07-31"), (2, 3, "2026-08-01", "2026-08-31")])

_BLOCKED = json.dumps({
    "status": "blocked", "level": "MONTH", "children": [],
    "assumptions": [],
    "dataGaps": [{
        "id": "dg1", "requiredParameter": "Месячный бюджет ФОТ", "expectedUnit": "₽/мес",
        "whyNeeded": "для расчёта найма", "suggestedSource": "финмодель",
        "blocksDecomposition": True,
    }],
    "alternatives": [],
    "verification": {"conservationOk": False, "notes": ""},
}, ensure_ascii=False)

_ALTERNATIVES = json.dumps({
    "status": "proposed", "level": "MONTH", "children": [],
    "assumptions": [], "dataGaps": [],
    "alternatives": [
        {"label": "быстрее", "tradeoff": "дороже",
         "children": [_child(1, 10, "2026-07-01", "2026-07-31")], "assumptions": []},
        {"label": "дешевле", "tradeoff": "медленнее",
         "children": [_child(1, 5, "2026-07-01", "2026-07-31"),
                      _child(2, 5, "2026-08-01", "2026-08-31")], "assumptions": []},
    ],
    "verification": {"conservationOk": True, "notes": ""},
}, ensure_ascii=False)


class FakeResponder:
    """Возвращает заранее заданные ответы по очереди; запоминает user-сообщения."""

    def __init__(self, *responses):
        self.responses = list(responses)
        self.calls: list[str] = []

    async def __call__(self, system: str, user: str) -> str:
        self.calls.append(user)
        idx = min(len(self.calls) - 1, len(self.responses) - 1)
        return self.responses[idx]


# ─────────────────────────── тесты ───────────────────────────

async def test_proposed_ok():
    fake = FakeResponder(_GOOD)
    result = await decompose(level="MONTH", goal=GOAL, dataset=DATASET, responder=fake)
    assert result.status == "proposed"
    assert result.attempts == 1
    assert len(result.children) == 2
    assert result.children[0]["allocatedMetrics"][0]["targetValue"] == 6


async def test_blocked_on_blocking_datagap():
    fake = FakeResponder(_BLOCKED)
    result = await decompose(level="MONTH", goal=GOAL, dataset=DATASET, responder=fake)
    assert result.status == "blocked"
    assert result.children == []
    assert result.data_gaps and result.data_gaps[0]["requiredParameter"] == "Месячный бюджет ФОТ"


async def test_retry_on_verifier_failure_then_ok():
    fake = FakeResponder(_BAD_SUM, _GOOD)
    result = await decompose(level="MONTH", goal=GOAL, dataset=DATASET, responder=fake)
    assert result.status == "proposed"
    assert result.attempts == 2
    # во второй вызов модели приложен список ошибок верификатора
    assert "ConservationError" in fake.calls[1]


async def test_recover_from_bad_json():
    fake = FakeResponder("это не JSON, а свободный текст", _GOOD)
    result = await decompose(level="MONTH", goal=GOAL, dataset=DATASET, responder=fake)
    assert result.status == "proposed"
    assert result.attempts == 2
    assert "валидный JSON" in fake.calls[1]


async def test_exhausts_retries_returns_error():
    fake = FakeResponder(_BAD_SUM)  # всегда несходящаяся сумма
    result = await decompose(level="MONTH", goal=GOAL, dataset=DATASET,
                             responder=fake, max_retries=1)
    assert result.status == "error"
    assert result.attempts == 2
    assert "ConservationError" in result.verifier_feedback


async def test_alternatives_verified():
    fake = FakeResponder(_ALTERNATIVES)
    result = await decompose(level="MONTH", goal=GOAL, dataset=DATASET,
                             request="alternatives", alternatives_count=2, responder=fake)
    assert result.status == "proposed"
    assert len(result.alternatives) == 2
    assert {a["label"] for a in result.alternatives} == {"быстрее", "дешевле"}


async def test_unaccounted_metric_triggers_retry():
    # цель с двумя метриками, но модель упорно теряет office_opened
    goal = {
        **GOAL,
        "targetMetrics": [
            {"id": "headcount", "name": "Найм", "unit": "чел.", "targetValue": 10, "source": "user_input"},
            {"id": "office_opened", "name": "Офис", "unit": "шт", "targetValue": 1, "source": "user_input"},
        ],
    }
    fake = FakeResponder(_GOOD)  # несёт только headcount
    result = await decompose(level="MONTH", goal=goal, dataset={"headcount": 10, "office_opened": 1},
                             responder=fake, max_retries=1)
    assert result.status == "error"
    assert "UnaccountedMetric" in result.verifier_feedback


class RaisingResponder:
    """Респондер, имитирующий сбой вызова LLM (например, модель не настроена)."""

    def __init__(self, exc):
        self.exc = exc
        self.calls = 0

    async def __call__(self, system, user):
        self.calls += 1
        raise self.exc


async def test_llm_error_returns_managed_error():
    # Ошибка вызова модели НЕ должна пробрасываться (иначе роут отдаст 500).
    fake = RaisingResponder(RuntimeError("Pricing is not configured for model: claude-opus-4.7"))
    result = await decompose(level="MONTH", goal=GOAL, dataset=DATASET,
                             responder=fake, max_retries=1)
    assert result.status == "error"
    assert result.attempts == 2          # первая попытка + 1 ретрай
    assert fake.calls == 2
    assert "LLM" in (result.error or "")
