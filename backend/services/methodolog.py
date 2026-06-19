"""AI-Methodolog agent.

Given a user's reasoning (in Russian), it retrieves grounded evidence with the
hybrid search and composes an answer in the fixed format:

    пересказ мысли → методологический риск/ошибка → какая методика подтверждает
    → ССЫЛКА (источник, страница, раздел) → уточняющие вопросы → как правильнее.

HARD RULE — no invented citations. The model is only allowed to pick WHICH of the
retrieved excerpts (labelled S1..Sn) support a point; the source/page/section in
the final citation are taken from our retrieved data, never from the model's text.
If nothing relevant was retrieved, the agent says so honestly instead of citing.
"""
from __future__ import annotations

import asyncio
import json
import re

from ..core.config import get_settings
from .knowledge_search import search, SearchHit

METHODOLOG_MODEL = "google/gemini-3.1-flash-lite"
MAX_EVIDENCE = 8
EVIDENCE_CHARS = 600

SYSTEM_PROMPT = (
    "Ты — ИИ-Методолог: строгий, доброжелательный консультант по методологиям "
    "управления бизнес-процессами и их зрелости. Тебе дают рассуждение пользователя "
    "и НАЙДЕННЫЕ выдержки из источников с метками S1, S2, … Каждая выдержка снабжена "
    "источником, страницей и разделом.\n\n"
    "ЖЁСТКОЕ ПРАВИЛО: опираться и ссылаться можно ТОЛЬКО на предоставленные метки S#. "
    "Запрещено выдумывать факты, номера страниц, разделы или методики, которых нет в "
    "выдержках. Если выдержки НЕ подтверждают мысль — честно поставь has_support=false "
    "и не ссылайся ни на что.\n\n"
    "В полях restate/risk/method/clarifying_questions/better_formulation НЕ упоминай "
    "метки S1, S2 и т.п. — они служебные и нужны только в поле support. Пиши обычным "
    "человеческим языком.\n\n"
    "Отвечай по-русски, по делу, без воды. Верни ТОЛЬКО валидный JSON по схеме:\n"
    "{\n"
    '  "restate": "краткий пересказ мысли пользователя своими словами",\n'
    '  "risk": "методологический риск или ошибка в рассуждении; если рисков не видно — так и скажи",\n'
    '  "method": "какая методика/принцип это поясняет — кратко и ТОЛЬКО на основе выдержек",\n'
    '  "support": ["S1", "S3"],\n'
    '  "has_support": true,\n'
    '  "clarifying_questions": ["1-3 уточняющих вопроса"],\n'
    '  "better_formulation": "как сформулировать мысль правильнее"\n'
    "}\n"
    "support — только метки из контекста, которые реально подтверждают разбор; [] если нет."
)


def _usage_dict(resp) -> dict:
    """Расход токенов из ответа провайдера (нули, если usage не пришёл)."""
    u = getattr(resp, "usage", None)
    return {
        "prompt_tokens": int(getattr(u, "prompt_tokens", 0) or 0),
        "completion_tokens": int(getattr(u, "completion_tokens", 0) or 0),
        "total_tokens": int(getattr(u, "total_tokens", 0) or 0),
    }


def _chat_json(model: str, system: str, user: str, *, max_tokens: int = 1200) -> tuple[dict, dict]:
    """Вызвать модель и вернуть (распарсенный JSON, расход токенов).

    max_tokens поднимается для объёмных ответов (например, ревью всего проекта).
    """
    from openai import OpenAI
    settings = get_settings()
    client = OpenAI(api_key=settings.promptra_api_key, base_url=settings.promptra_base_url, timeout=120)
    resp = client.chat.completions.create(
        model=model,
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        temperature=0.2,
        max_tokens=max_tokens,
    )
    raw = resp.choices[0].message.content or ""
    m = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", raw, re.DOTALL)
    if m:
        raw = m.group(1)
    else:
        i, j = raw.find("{"), raw.rfind("}")
        raw = raw[i:j + 1] if i != -1 and j != -1 else "{}"
    return json.loads(raw), _usage_dict(resp)


def _evidence_block(hits: list[SearchHit]) -> tuple[str, dict[str, SearchHit]]:
    lines, labels = [], {}
    for idx, h in enumerate(hits, 1):
        label = f"S{idx}"
        labels[label] = h
        kind = {"method_card": "карточка методики", "typical_error": "типичная ошибка",
                "diagnostic_question": "диагностический вопрос"}.get(h.card_type or "", "фрагмент источника")
        section = h.section or h.title or "—"
        lines.append(
            f"{label} [{kind}; источник {h.source_key}, стр. {h.page_start}–{h.page_end}, "
            f"раздел «{section}»]: {h.text[:EVIDENCE_CHARS].strip()}"
        )
    return "\n\n".join(lines), labels


def _citation(h: SearchHit) -> str:
    section = h.section or h.title or "—"
    pages = f"стр. {h.page_start}" + (f"–{h.page_end}" if h.page_end and h.page_end != h.page_start else "")
    return f"{(h.source_key or '').upper()}, {pages}, раздел «{section}»"


def render(answer: dict, labels: dict[str, SearchHit]) -> str:
    # Keep only citations that map to real retrieved evidence (hard rule guard).
    valid = [s for s in (answer.get("support") or []) if s in labels]
    has_support = bool(answer.get("has_support")) and bool(valid)

    out = []
    out.append("🔄 **Ваша мысль (как я понял):**\n" + (answer.get("restate") or "—").strip())
    out.append("⚠️ **Методологический риск / ошибка:**\n" + (answer.get("risk") or "—").strip())
    out.append("📘 **Что говорит методика:**\n" + (answer.get("method") or "—").strip())

    if has_support:
        cites = []
        seen = set()
        for s in valid:
            c = _citation(labels[s])
            if c not in seen:
                cites.append("• " + c)
                seen.add(c)
        out.append("🔗 **Ссылка на источник:**\n" + "\n".join(cites))
    else:
        out.append(
            "🔗 **Ссылка на источник:**\nПодтверждения в загруженных источниках не нашлось. "
            "Это наблюдение основано на общих соображениях, а не на конкретном источнике — "
            "отнеситесь к нему как к гипотезе."
        )

    qs = answer.get("clarifying_questions") or []
    if qs:
        out.append("❓ **Уточняющие вопросы:**\n" + "\n".join(f"• {q}" for q in qs))
    out.append("✅ **Как сформулировать правильнее:**\n" + (answer.get("better_formulation") or "—").strip())
    return "\n\n".join(out)


async def ask_methodolog(
    query: str,
    *,
    methodology: str | None = None,
    model: str = METHODOLOG_MODEL,
    system_prompt: str | None = None,
    persistent_prompt: str | None = None,
    source_keys: list[str] | None = None,
) -> dict:
    """Запустить агента-Методолога с конфигом бота (промпты/модель/источники из БД).

    Все параметры конфига опциональны — при отсутствии используются прежние
    значения (захардкоженный SYSTEM_PROMPT, METHODOLOG_MODEL, поиск по всей базе),
    чтобы существующие скрипты/вызовы не сломались.

      • system_prompt     — роль бота, идёт как system-роль;
      • persistent_prompt — стоячая инструкция, добавляется к КАЖДОМУ запросу;
      • source_keys       — ключи источников фреймворков бота (фильтр поиска).

    Возвращает {'answer': str, 'evidence': [SearchHit], 'raw': dict, 'usage': dict}.
    """
    system = system_prompt or SYSTEM_PROMPT
    hits = await search(
        query, scope="both", methodology=methodology, source_keys=source_keys, limit=MAX_EVIDENCE
    )
    evidence, labels = _evidence_block(hits)
    if not hits:
        user = f"РАССУЖДЕНИЕ ПОЛЬЗОВАТЕЛЯ:\n{query}\n\nНАЙДЕННЫЕ ВЫДЕРЖКИ: (ничего не найдено)\n\nОтветь по схеме; has_support=false."
    else:
        user = f"РАССУЖДЕНИЕ ПОЛЬЗОВАТЕЛЯ:\n{query}\n\nНАЙДЕННЫЕ ВЫДЕРЖКИ:\n{evidence}\n\nОтветь по схеме."

    # Постоянный промпт добавляется к каждому запросу как стоячее напоминание,
    # чтобы не теряться в длинных диалогах.
    if persistent_prompt and persistent_prompt.strip():
        user = f"{user}\n\nПОСТОЯННАЯ ИНСТРУКЦИЯ:\n{persistent_prompt.strip()}"

    usage = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
    try:
        raw, usage = await asyncio.to_thread(_chat_json, model, system, user)
    except Exception as e:  # noqa: BLE001
        raw = {
            "restate": query, "risk": "Не удалось получить ответ модели.",
            "method": "", "support": [], "has_support": False,
            "clarifying_questions": [], "better_formulation": "",
            "_error": f"{type(e).__name__}: {str(e)[:160]}",
        }
    return {"answer": render(raw, labels), "evidence": hits, "raw": raw, "usage": usage}
