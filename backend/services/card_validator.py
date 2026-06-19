"""AI-валидатор карточек фреймворка проекта.

Берёт содержимое одной карточки («Диагноз», «Стратегический выбор», …),
достаёт релевантные выдержки из RAG (тот же гибридный поиск, что и у Методолога)
и просит модель проверить, заполнена ли карточка корректно и полно ПО МЕТОДОЛОГИЯМ
из найденных источников.

HARD RULE (как в methodolog.py): ссылаться можно ТОЛЬКО на найденные выдержки
S1..Sn. Если подтверждения в источниках нет — has_support=false, без ссылок.
Источник/страница/раздел в финальной ссылке берутся из наших данных, а не из текста
модели — модель лишь выбирает, какие метки реально подтверждают разбор.
"""
from __future__ import annotations

import asyncio

from .knowledge_search import search, SearchHit
# Переиспользуем готовые хелперы Методолога: формат выдержек, цитаты, вызов модели,
# подсчёт токенов — чтобы не дублировать строгий контракт ссылок.
from .methodolog import (
    METHODOLOG_MODEL,
    MAX_EVIDENCE,
    _chat_json,
    _citation,
    _evidence_block,
    _usage_dict,  # noqa: F401  (реэкспорт для совместимости/тестов)
)

VALID_VERDICTS = {"valid", "partial", "invalid", "no_evidence"}

SYSTEM_PROMPT = (
    "Ты — ИИ-валидатор карточек проектного фреймворка: строгий методолог, который "
    "проверяет, заполнена ли карточка КОРРЕКТНО и ПОЛНО по методологиям управления. "
    "Тебе дают название карточки, её текущее содержимое и НАЙДЕННЫЕ выдержки из "
    "источников с метками S1, S2, … Каждая выдержка снабжена источником, страницей и "
    "разделом.\n\n"
    "ЖЁСТКОЕ ПРАВИЛО: опираться и ссылаться можно ТОЛЬКО на предоставленные метки S#. "
    "Запрещено выдумывать факты, номера страниц, разделы или методики, которых нет в "
    "выдержках. Если выдержки НЕ относятся к карточке — поставь has_support=false, "
    "verdict='no_evidence' и не ссылайся ни на что.\n\n"
    "Оценивай строго по методологии из выдержек: какие обязательные элементы карточки "
    "присутствуют, что заполнено с методологической ошибкой, чего не хватает.\n\n"
    "В полях summary/issues/missing/recommendations НЕ упоминай метки S1, S2 и т.п. — "
    "они служебные и нужны только в поле support. Пиши обычным человеческим языком "
    "по-русски, по делу, без воды. Верни ТОЛЬКО валидный JSON по схеме:\n"
    "{\n"
    '  "verdict": "valid | partial | invalid | no_evidence",\n'
    '  "summary": "1-2 предложения: итоговая оценка заполнения карточки",\n'
    '  "issues": ["методологические ошибки или нарушения в текущем заполнении"],\n'
    '  "missing": ["обязательные по методологии элементы, которых не хватает"],\n'
    '  "recommendations": ["конкретные шаги, как исправить"],\n'
    '  "support": ["S1", "S3"],\n'
    '  "has_support": true\n'
    "}\n"
    "verdict='valid' — карточка заполнена корректно и полно; 'partial' — есть пробелы; "
    "'invalid' — есть методологические ошибки; 'no_evidence' — в источниках нет основания "
    "для проверки. support — только метки из контекста, реально подтверждающие разбор; [] если нет."
)


def _normalize_list(value) -> list[str]:
    if not value:
        return []
    if isinstance(value, str):
        value = [value]
    return [str(x).strip() for x in value if str(x).strip()]


def render(answer: dict, labels: dict[str, SearchHit]) -> str:
    """Собрать читаемый markdown-разбор. Ссылки — только на реальные метки (guard)."""
    valid = [s for s in (answer.get("support") or []) if s in labels]
    has_support = bool(answer.get("has_support")) and bool(valid)

    verdict = answer.get("verdict")
    verdict_label = {
        "valid": "✅ Карточка валидна по методологии",
        "partial": "🟡 Заполнено частично",
        "invalid": "⛔ Есть методологическая ошибка",
        "no_evidence": "❔ Нет подтверждения в источниках",
    }.get(verdict if verdict in VALID_VERDICTS else "no_evidence", "❔ Нет подтверждения в источниках")

    out: list[str] = []
    out.append(f"**{verdict_label}**")
    out.append("📋 **Итог проверки:**\n" + (answer.get("summary") or "—").strip())

    issues = _normalize_list(answer.get("issues"))
    if issues:
        out.append("⚠️ **Методологические ошибки:**\n" + "\n".join(f"• {x}" for x in issues))

    missing = _normalize_list(answer.get("missing"))
    if missing:
        out.append("🧩 **Чего не хватает по методологии:**\n" + "\n".join(f"• {x}" for x in missing))

    recs = _normalize_list(answer.get("recommendations"))
    if recs:
        out.append("✅ **Как исправить:**\n" + "\n".join(f"• {x}" for x in recs))

    if has_support:
        cites, seen = [], set()
        for s in valid:
            c = _citation(labels[s])
            if c not in seen:
                cites.append("• " + c)
                seen.add(c)
        out.append("🔗 **Ссылка на источник:**\n" + "\n".join(cites))
    else:
        out.append(
            "🔗 **Ссылка на источник:**\nПодтверждения в загруженных источниках не нашлось. "
            "Эта оценка основана на общих соображениях, а не на конкретном источнике — "
            "отнеситесь к ней как к гипотезе."
        )
    return "\n\n".join(out)


async def validate_card(
    card_title: str,
    card_content: str,
    *,
    model: str = METHODOLOG_MODEL,
    source_keys: list[str] | None = None,
) -> dict:
    """Проверить заполнение карточки по методологиям из RAG.

    Возвращает {'answer': str, 'verdict': str, 'evidence': [SearchHit], 'raw': dict, 'usage': dict}.
    """
    query = f"Методология заполнения раздела «{card_title}».\n\n{card_content}".strip()
    hits = await search(query, scope="both", source_keys=source_keys, limit=MAX_EVIDENCE)
    evidence, labels = _evidence_block(hits)

    if not hits:
        user = (
            f"КАРТОЧКА: {card_title}\n\nСОДЕРЖИМОЕ КАРТОЧКИ:\n{card_content}\n\n"
            "НАЙДЕННЫЕ ВЫДЕРЖКИ: (ничего не найдено)\n\n"
            "Ответь по схеме; has_support=false, verdict='no_evidence'."
        )
    else:
        user = (
            f"КАРТОЧКА: {card_title}\n\nСОДЕРЖИМОЕ КАРТОЧКИ:\n{card_content}\n\n"
            f"НАЙДЕННЫЕ ВЫДЕРЖКИ:\n{evidence}\n\nОтветь по схеме."
        )

    usage = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
    try:
        raw, usage = await asyncio.to_thread(_chat_json, model, SYSTEM_PROMPT, user)
    except Exception as e:  # noqa: BLE001 — не валим запрос, отдаём честный фолбэк
        raw = {
            "verdict": "no_evidence",
            "summary": "Не удалось получить ответ модели.",
            "issues": [],
            "missing": [],
            "recommendations": [],
            "support": [],
            "has_support": False,
            "_error": f"{type(e).__name__}: {str(e)[:160]}",
        }

    verdict = raw.get("verdict")
    if verdict not in VALID_VERDICTS:
        verdict = "no_evidence"

    # Лёгкая выжимка источников для UI (без полного текста выдержек).
    evidence_out = [
        {
            "source_key": h.source_key,
            "page_start": h.page_start,
            "page_end": h.page_end,
            "section": h.section or h.title,
            "card_type": h.card_type,
        }
        for h in hits
    ]
    return {
        "answer": render(raw, labels),
        "verdict": verdict,
        "evidence": evidence_out,
        "raw": raw,
        "usage": usage,
    }
