"""AI-Методолог уровня всего проекта.

Два режима:
  • review_project — полный анализ проекта и оценка-светофор R/A/G (Red/Amber/Green)
    по каждому разделу и в целом, строго с опорой на методологии из RAG (ссылки на источники).
  • chat_methodolog — диалог-уточнение после оценки. Модель может ПРЕДЛАГАТЬ правки проекта
    (формулировки, создание/удаление повторяющихся «окон»), но НИКОГДА не вносит их сама:
    она возвращает структурированные proposals, а применяет их фронтенд только после явного
    подтверждения пользователем.

HARD RULE (как в methodolog.py / card_validator.py): ссылаться можно ТОЛЬКО на найденные
выдержки S1..Sn. Источник/страница/раздел берутся из наших данных, а не из текста модели.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import re
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession

from . import project_cards
from .knowledge_search import SearchHit, search
from .methodolog import (
    METHODOLOG_MODEL,
    MAX_EVIDENCE,
    _chat_json,
    _citation,
    _evidence_block,
)

logger = logging.getLogger(__name__)

RAG_VALUES = {"green", "amber", "red"}
VALID_OPS = {"update_field", "update_item", "add_item", "delete_item"}

# ── Роутинг моделей по типу запроса (экономия токенов) ───────────────────────
# Поиск по базе знаний — это эмбеддинги + Postgres (без чат-модели), поэтому
# экономить чат-токены можно только на ОДНОМ вызове-анализе. Делаем это так:
#   • light  — вопрос/уточнение → дешёвая быстрая модель, сжатый контекст;
#   • heavy  — «заполни/доработай/исправь раздел» → сильная модель + фокус-карточка целиком;
#   • whole  — «проверь весь проект/в целом» → сильная модель + полный контекст.
# Классификация — эвристика по ключевым словам (бесплатно, без лишнего вызова).
# При неоднозначности склоняемся к heavy (сильная модель), чтобы не терять качество.
_WHOLE_PAT = re.compile(
    r"вес[ьья]\s+проект|по\s+всем(?:у)?\s+(?:раздел|проект)|все\s+раздел|"
    r"проект(?:а)?\s+в\s+целом|в\s+целом\s+по\s+проект|всю\s+картин|целостн|связност",
    re.IGNORECASE,
)
_HEAVY_PAT = re.compile(
    r"заполн|дозаполн|доработ|допиш|дополн|перепиш|переформул|сформулир|распиш|"
    r"исправ|поправ|улучш|внеси|внест|оформ|проработ|состав|подготов|"
    r"добав(?:ь|ить|ляй)|приведи\s+в\s+порядок|приведи\s+к",
    re.IGNORECASE,
)


def classify_intent(message: str) -> str:
    """light | heavy | whole — по тексту сообщения пользователя (см. комментарий выше)."""
    text = (message or "").strip().lower()
    if _WHOLE_PAT.search(text):
        return "whole"
    if _HEAVY_PAT.search(text):
        return "heavy"
    return "light"


def _compact_card(card: dict) -> dict:
    """Сжать редактируемую карточку: оставить структуру (id/метки), убрать значения.

    Структура (card_id, заголовки, id элементов, ключи полей) дёшева и нужна, чтобы модель
    могла сослаться на элемент; дорогие именно ЗНАЧЕНИЯ полей — их и выкидываем у не-фокусных
    карточек. Метку элемента (label) оставляем как краткую сводку.
    """
    out: dict = {"card_id": card.get("card_id"), "title": card.get("title")}
    fields = card.get("fields")
    if isinstance(fields, list) and fields:
        out["fields"] = [{"key": f.get("key"), "label": f.get("label")} for f in fields]
    lists = []
    for lst in card.get("lists") or []:
        items = [{"id": it.get("id"), "label": it.get("label")} for it in (lst.get("items") or [])]
        lists.append({"list": lst.get("list"), "title": lst.get("title"), "items": items})
    out["lists"] = lists
    return out


def _format_plan(plan: dict | None) -> str:
    """Текст согласованного плана + вопросы/ответы — подкладываем в КАЖДЫЙ запрос, чтобы план
    был у модели независимо от лимита истории (history[-10:])."""
    if not isinstance(plan, dict):
        return ""
    text = str(plan.get("text") or "").strip()
    questions = plan.get("questions") or []
    answers = plan.get("answers") or []
    out = []
    if text:
        out.append("СОГЛАСОВАННЫЙ ПЛАН (карточка " + str(plan.get("card_id") or "") + "):\n" + text)
    qa = []
    for i, q in enumerate(questions):
        a = answers[i] if isinstance(answers, list) and i < len(answers) else ""
        qa.append(f"{i + 1}. {str(q).strip()}\n   Ответ пользователя: {str(a).strip() or '(пока без ответа)'}")
    if qa:
        out.append("УТОЧНЯЮЩИЕ ВОПРОСЫ И ОТВЕТЫ:\n" + "\n".join(qa))
    return "\n\n".join(out)


def _compact_project_model(model: dict | None, focus_card_id: str | None) -> dict | None:
    """Фокус-карточка — целиком, остальные редактируемые — сжато; context_cards — короче.

    focus_card_id None / 'whole-project' → возвращаем модель как есть (полный контекст).
    """
    if not isinstance(model, dict) or not focus_card_id or focus_card_id == "whole-project":
        return model
    editable = model.get("editable_cards")
    if not isinstance(editable, list):
        return model
    new_editable = [
        c if c.get("card_id") == focus_card_id else _compact_card(c)
        for c in editable
    ]
    context = [
        {"card_id": c.get("card_id"), "title": c.get("title"),
         "text": str(c.get("text") or "")[:200]}
        for c in (model.get("context_cards") or [])
    ]
    return {"editable_cards": new_editable, "context_cards": context}

REVIEW_SYSTEM_PROMPT = (
    "Ты — ИИ-Методолог, который проверяет ВЕСЬ проект целиком по методологиям управления. "
    "Тебе дают содержимое всех разделов проекта и НАЙДЕННЫЕ выдержки из источников с метками "
    "S1, S2, … Каждая выдержка снабжена источником, страницей и разделом.\n\n"
    "ЖЁСТКОЕ ПРАВИЛО: опираться и ссылаться можно ТОЛЬКО на предоставленные метки S#. Запрещено "
    "выдумывать факты, страницы, разделы или методики, которых нет в выдержках. Если выдержки не "
    "относятся к разделу — не ссылайся, но оценку по полноте/связности всё равно дай.\n\n"
    "Оцени КАЖДЫЙ переданный раздел светофором RAG строго:\n"
    "  • green — раздел заполнен корректно и полно по методологии, без существенных пробелов;\n"
    "  • amber — заполнен частично или есть методологические сомнения/нестыковки;\n"
    "  • red — раздел пустой, с грубой методологической ошибкой или ломает связность проекта.\n"
    "Будь строг: пустой или почти пустой раздел — это red, а не amber.\n"
    "Если в тексте раздела отмечены незаполненные связи между элементами (символ ⚠, например "
    "«разрыв не выбран», «подтверждающий факт не выбран»), считай это методологическим пробелом: "
    "не ставь такому разделу green — единичные пробелы это amber, системные (много ⚠) — red; "
    "перечисли недостающие связи в missing и дай шаги в recommendations.\n\n"
    "overall — общая оценка проекта: red, если хотя бы один критичный для логики раздел red; "
    "amber, если есть пробелы; green только при полной согласованной проработке.\n\n"
    "В summary/issues/missing/recommendations НЕ упоминай метки S1, S2 — они только в support. "
    "Пиши по-русски, по делу, без воды. Верни ТОЛЬКО валидный JSON по схеме:\n"
    "{\n"
    '  "overall": "green | amber | red",\n'
    '  "summary": "1-2 предложения: общий вывод по проекту",\n'
    '  "sections": [\n'
    '    {"card_id": "...", "title": "...", "rag": "green|amber|red",\n'
    '     "issues": ["методологические ошибки/нестыковки"],\n'
    '     "missing": ["чего не хватает по методологии"],\n'
    '     "recommendations": ["конкретные шаги исправления"]}\n'
    "  ],\n"
    '  "support": ["S1", "S3"],\n'
    '  "has_support": true\n'
    "}\n"
    "В sections верни по одному объекту на КАЖДЫЙ переданный card_id. support — только метки из "
    "контекста, реально подтверждающие разбор; [] если нет."
)

CHAT_SYSTEM_PROMPT = (
    "Ты — ИИ-Методолог проекта: строгий, доброжелательный консультант по методологиям управления. "
    "Пользователь уточняет детали проекта после оценки. Тебе дают: сообщение пользователя, краткую "
    "карту редактируемого проекта (PROJECT_MODEL) с card_id, полями и элементами (их id), последнюю "
    "оценку (REVIEW) и НАЙДЕННЫЕ выдержки из источников S1..Sn.\n\n"
    "КРИТИЧЕСКОЕ ПРАВИЛО: ты НЕ можешь менять проект сам. Любое изменение ты только ПРЕДЛАГАЕШЬ как "
    "proposal и ДОЖДЁШЬСЯ подтверждения пользователя. НИКОГДА не пиши, что изменение уже внесено/"
    "сохранено — его применит пользователь кнопкой. Не выдумывай card_id, поля или id элементов — "
    "используй только те, что есть в PROJECT_MODEL.\n\n"
    "ОТВЕЧАЙ КОМПЛЕКСНО, А НЕ ОБРЫВОЧНО. Разбирай раздел целиком, а не отдельные строки: дай связный "
    "разбор всего блока и задай ВСЕ существенные уточняющие вопросы, а не один-два. "
    "Каждая правка — отдельный proposal; правок может быть много, это нормально. "
    "Виды операций (op):\n"
    "  • update_field — изменить скалярное поле карточки: {card_id, field, value}\n"
    "  • update_item — изменить поля элемента списка: {card_id, list, item_id, values:{...}} (для разделов list опусти)\n"
    "  • add_item — добавить новый элемент/окно: {card_id, list, values:{...}} (для разделов list опусти)\n"
    "  • delete_item — удалить элемент/окно (в т.ч. дубль): {card_id, list, item_id}\n\n"
    "ПРАВИЛА ВЫБОРА:\n"
    "  • item_id бери ТОЧНО из поля id элемента в PROJECT_MODEL (НЕ индекс, НЕ название). Если нужного "
    "элемента в PROJECT_MODEL нет — используй add_item, а не update_item.\n"
    "  • Правка элемента раздела (карточки с lists, где list пустой '') — это ВСЕГДА update_item с item_id, "
    "а не update_field. update_field используй только для скалярных полей карточки (fields).\n"
    "  • Для сложных карточек указывай list ТОЧНО как в PROJECT_MODEL (поле list у списка).\n"
    "  • Если у поля (в fields или item_fields) задан список options — выбирай значение СТРОГО из options, "
    "дословно, без своих формулировок (это выпадающий список). Для зависимых полей держи согласованность с "
    "родительским полем; для полей-ссылок на другие карточки бери значение из их options (название связанной "
    "карточки).\n\n"
    "ПОЛНОТА ПРАВОК (важно):\n"
    "  • Когда пользователь просит заполнить/доработать/исправить экран, раздел или карточку — пройди по "
    "ВСЕМ полям (fields) и ВСЕМ элементам (items) этого блока из PROJECT_MODEL и предложи правку для каждого, "
    "где есть что улучшить: update_field на каждое скалярное поле, update_item на каждый существующий элемент, "
    "add_item на недостающие по методологии элементы. Не ограничивайся частью полей и не оставляй блок "
    "наполовину пустым.\n"
    "  • СОБЛЮДАЙ ОБЪЁМ ПРОСЬБЫ. Если просят заполнить/доработать сам элемент или раздел — заполняй элемент "
    "целиком (все ключевые поля из item_fields). Если просьба узкая — про конкретные поля или про связи/"
    "выпадающие списки — меняй ТОЛЬКО эти поля у каждого элемента, не переписывая остальные. Это держит ответ "
    "компактным, быстрым и применимым (большой ответ может не уложиться в лимит времени).\n"
    "  • НАСТРАИВАЙ СВЯЗИ между УЖЕ существующими элементами через поля-ссылки (выпадашки с options), не "
    "оставляй их пустыми. Например в Диагнозе: у симптома — relatedGap, у разрыва — confirmingFact, у факта — "
    "confirms, у альтернативы — confirms/refutes. Значение бери СТРОГО из options поля. Если подходящей цели в "
    "options нет — НЕ создавай её ради связи и не плоди лишние правки: оставь поле пустым и одной строкой в reply "
    "отметь, чего не хватает (это держит ответ компактным и в пределах лимита времени).\n"
    "  • Опирайся на всю карту PROJECT_MODEL и context_cards, чтобы правки были согласованы между разделами.\n\n"
    "В ЖЁСТКОМ правиле ссылок: ссылайся на методики только метками S#. В reply метки S# не упоминай. "
    "Пиши по-русски. Верни ТОЛЬКО валидный JSON по схеме:\n"
    "{\n"
    '  "reply": "ответ методолога обычным текстом",\n'
    '  "proposals": [\n'
    '    {"id": "p1", "op": "update_field|update_item|add_item|delete_item", "card_id": "...",\n'
    '     "list": "...", "item_id": "...", "field": "...", "value": "...", "values": {"...": "..."},\n'
    '     "human": "что именно изменится — кратко и по-русски", "rationale": "почему по методологии"}\n'
    "  ]\n"
    "}\n"
    "Если правок не нужно — proposals: []. Лишние поля op просто не указывай."
)


def _normalize_list(value) -> list[str]:
    if not value:
        return []
    if isinstance(value, str):
        value = [value]
    return [str(x).strip() for x in value if str(x).strip()]


def _coerce_rag(value) -> str:
    v = str(value or "").strip().lower()
    return v if v in RAG_VALUES else "amber"


RAG_LABEL = {"green": "🟢 GREEN", "amber": "🟡 AMBER", "red": "🔴 RED"}


def render_review(answer: dict, labels: dict[str, SearchHit]) -> str:
    """Читаемый markdown-разбор всего проекта. Ссылки — только на реальные метки (guard)."""
    valid = [s for s in (answer.get("support") or []) if s in labels]
    has_support = bool(answer.get("has_support")) and bool(valid)

    overall = _coerce_rag(answer.get("overall"))
    out: list[str] = [f"**Проект в целом: {RAG_LABEL[overall]}**"]
    out.append("📋 **Итог:**\n" + (str(answer.get("summary") or "—")).strip())

    for sec in answer.get("sections") or []:
        rag = _coerce_rag(sec.get("rag"))
        title = str(sec.get("title") or sec.get("card_id") or "—").strip()
        block = [f"**{RAG_LABEL[rag]} — {title}**"]
        issues = _normalize_list(sec.get("issues"))
        if issues:
            block.append("⚠️ Ошибки: " + "; ".join(issues))
        missing = _normalize_list(sec.get("missing"))
        if missing:
            block.append("🧩 Не хватает: " + "; ".join(missing))
        recs = _normalize_list(sec.get("recommendations"))
        if recs:
            block.append("✅ Исправить: " + "; ".join(recs))
        out.append("\n".join(block))

    if has_support:
        cites, seen = [], set()
        for s in valid:
            c = _citation(labels[s])
            if c not in seen:
                cites.append("• " + c)
                seen.add(c)
        out.append("🔗 **Ссылки на источники:**\n" + "\n".join(cites))
    else:
        out.append(
            "🔗 **Ссылки на источники:**\nПодтверждения в загруженных источниках не нашлось — "
            "оценка опирается на общие методологические соображения."
        )
    return "\n\n".join(out)


def _evidence_out(hits: list[SearchHit]) -> list[dict]:
    return [
        {
            "source_key": h.source_key,
            "page_start": h.page_start,
            "page_end": h.page_end,
            "section": h.section or h.title,
            "card_type": h.card_type,
        }
        for h in hits
    ]


async def review_project(
    full_text: str,
    sections: list[dict],
    *,
    model: str = METHODOLOG_MODEL,
    source_keys: list[str] | None = None,
) -> dict:
    """Оценить весь проект светофором R/A/G по методологиям из RAG.

    sections — [{card_id, title, text}]. Возврат:
    {answer(markdown), overall, summary, sections[], evidence[], has_support, raw, usage}.
    """
    # Запрос для поиска — ядро проекта (обрезаем, чтобы не раздувать эмбеддинг).
    query = ("Методологическая проверка проекта в целом.\n\n" + (full_text or "")).strip()[:2000]
    hits = await search(query, scope="both", source_keys=source_keys, limit=MAX_EVIDENCE)
    evidence, labels = _evidence_block(hits)

    sections_block = "\n\n".join(
        f"РАЗДЕЛ [{s.get('card_id')}] «{s.get('title')}»:\n{(s.get('text') or '(пусто)').strip()}"
        for s in sections
    ) or "(разделы не переданы)"
    card_ids = ", ".join(str(s.get("card_id")) for s in sections)

    if not hits:
        user = (
            f"СОДЕРЖИМОЕ ПРОЕКТА ПО РАЗДЕЛАМ:\n{sections_block}\n\n"
            "НАЙДЕННЫЕ ВЫДЕРЖКИ: (ничего не найдено)\n\n"
            f"Оцени каждый из card_id [{card_ids}] по схеме; has_support=false."
        )
    else:
        user = (
            f"СОДЕРЖИМОЕ ПРОЕКТА ПО РАЗДЕЛАМ:\n{sections_block}\n\n"
            f"НАЙДЕННЫЕ ВЫДЕРЖКИ:\n{evidence}\n\n"
            f"Оцени каждый из card_id [{card_ids}] по схеме."
        )

    usage = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
    try:
        raw, usage = await asyncio.to_thread(_chat_json, model, REVIEW_SYSTEM_PROMPT, user, max_tokens=2500)
    except Exception as e:  # noqa: BLE001 — отдаём честный фолбэк, не валим запрос
        raw = {
            "overall": "amber",
            "summary": "Не удалось получить ответ модели.",
            "sections": [],
            "support": [],
            "has_support": False,
            "_error": f"{type(e).__name__}: {str(e)[:160]}",
        }

    sections_out = [
        {
            "card_id": str(sec.get("card_id") or ""),
            "title": str(sec.get("title") or ""),
            "rag": _coerce_rag(sec.get("rag")),
            "issues": _normalize_list(sec.get("issues")),
            "missing": _normalize_list(sec.get("missing")),
            "recommendations": _normalize_list(sec.get("recommendations")),
        }
        for sec in (raw.get("sections") or [])
    ]
    return {
        "answer": render_review(raw, labels),
        "overall": _coerce_rag(raw.get("overall")),
        "summary": str(raw.get("summary") or "").strip(),
        "sections": sections_out,
        "evidence": _evidence_out(hits),
        "has_support": bool(raw.get("has_support")) and bool([s for s in (raw.get("support") or []) if s in labels]),
        "raw": raw,
        "usage": usage,
    }


SUGGEST_SYSTEM_PROMPT = (
    "Ты — методолог-стратег. На основе Диагностики, Стратегического выбора и Целевого состояния "
    "выдели КЛЮЧЕВЫЕ ДОПУЩЕНИЯ — то, что должно быть истинно, чтобы выбор и цели сработали, но что "
    "пока не проверено. Сформулируй их как проверяемые гипотезы.\n"
    "Требования к каждой:\n"
    "• формулировка вида «если … то … потому что …»;\n"
    "• фальсифицируема — можно представить факт, который её опровергнет;\n"
    "• привязана к конкретному результату/цели проекта.\n"
    "Не повторяй уже существующие гипотезы. Дай 4–7 штук.\n"
    "Ответ — СТРОГО JSON без пояснений: "
    '{"hypotheses":[{"name":"коротко","statement":"если…то…потому что…",'
    '"source":"диагноз|стратегический выбор|целевое состояние","expectedEffect":"на какой результат влияет"}]}'
)


def _sanitize_hypotheses(raw) -> list[dict]:
    """Оставить только валидные по форме гипотезы (есть формулировка или название)."""
    items = raw.get("hypotheses") if isinstance(raw, dict) else None
    out: list[dict] = []
    for item in items or []:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        statement = str(item.get("statement") or "").strip()
        if not name and not statement:
            continue
        out.append({
            "name": name[:160],
            "statement": statement[:600],
            "source": str(item.get("source") or "").strip()[:60],
            "expectedEffect": str(item.get("expectedEffect") or "").strip()[:200],
        })
    return out[:8]


async def suggest_hypotheses(
    context: str,
    existing: list[str],
    *,
    model: str = METHODOLOG_MODEL,
) -> dict:
    """Предложить проверяемые гипотезы из контекста проекта. Возврат: {hypotheses[], usage}."""
    existing_block = "\n".join(f"- {e.strip()}" for e in existing if e and e.strip()) or "(пока нет)"
    user = (
        f"КОНТЕКСТ ПРОЕКТА (диагностика, стратегический выбор, целевое состояние):\n"
        f"{(context or '(пусто)').strip()[:6000]}\n\n"
        f"УЖЕ ЕСТЬ ГИПОТЕЗЫ (не повторяй их):\n{existing_block}\n\n"
        "Предложи новые проверяемые гипотезы строго по схеме."
    )
    usage = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
    try:
        raw, usage = await asyncio.to_thread(_chat_json, model, SUGGEST_SYSTEM_PROMPT, user, max_tokens=1500)
    except Exception as e:  # noqa: BLE001 — отдаём честный фолбэк, не валим запрос
        return {"hypotheses": [], "usage": usage, "_error": f"{type(e).__name__}: {str(e)[:160]}"}
    return {"hypotheses": _sanitize_hypotheses(raw), "usage": usage}


def _sanitize_proposals(raw_proposals) -> list[dict]:
    """Оставить только валидные по форме proposals (op из белого списка, есть card_id и human)."""
    out: list[dict] = []
    for idx, p in enumerate(raw_proposals or [], 1):
        if not isinstance(p, dict):
            continue
        op = str(p.get("op") or "").strip()
        card_id = str(p.get("card_id") or "").strip()
        if op not in VALID_OPS or not card_id:
            continue
        clean = {
            "id": str(p.get("id") or f"p{idx}"),
            "op": op,
            "card_id": card_id,
            "human": str(p.get("human") or "").strip(),
            "rationale": str(p.get("rationale") or "").strip(),
        }
        for key in ("list", "item_id", "field", "value"):
            if p.get(key) is not None:
                clean[key] = p.get(key) if key == "value" else str(p.get(key)).strip()
        if isinstance(p.get("values"), dict):
            clean["values"] = {str(k): v for k, v in p["values"].items()}
        if not clean["human"]:
            continue
        out.append(clean)
    return out


PLAN_INSTRUCTION = (
    "РЕЖИМ ПЛАНИРОВАНИЯ. НЕ предлагай правки: поле proposals ОБЯЗАТЕЛЬНО оставь пустым ([]).\n"
    "Верни ДВА поля:\n"
    "• reply — краткий ПЛАН заполнения фокус-карточки по разделам/спискам и ключевым полям "
    "(что и в каком объёме заполнишь, сколько элементов добавишь). БЕЗ списка вопросов внутри reply.\n"
    "• questions — МАССИВ СТРОК: все существенные уточняющие вопросы, ответы на которые нужны для "
    "конкретного и качественного заполнения. Не выдумывай факты сам — спрашивай. Каждый вопрос — "
    "отдельная строка массива, кратко и по делу.\n"
    "Если в контексте есть СОГЛАСОВАННЫЙ ПЛАН и ОТВЕТЫ пользователя — учти их, обнови план и оставь в "
    "questions только реально оставшиеся вопросы (пустой массив [], если всё ясно для заполнения). "
    "Пользователь ответит на вопросы и нажмёт «Заполнить по плану». Пиши по-русски."
)


COMPOSITION_SYSTEM_PROMPT = (
    "Ты — ИИ-Методолог проекта. Твоя задача — собрать композицию ОДНОГО "
    "раздела проекта: стройный, связный русский текст, который полностью "
    "отображает информацию, уже внесённую в выбранную карточку/раздел.\n\n"
    "ЖЁСТКИЕ ПРАВИЛА:\n"
    "1. Используй ТОЛЬКО данные из PROJECT_MODEL. Не используй внешние знания, "
    "методологии, память, догадки или типовые шаблоны.\n"
    "2. Ничего не придумывай и не дополняй. Если поле пустое — не заполняй его смыслом "
    "от себя. Можно и НУЖНО структурировать изложение по РЕАЛЬНО присутствующим в "
    "данных блокам и элементам, но НЕ выдумывай разделы, заголовки или пункты, которых "
    "в данных нет, и не строй абстрактный шаблон документа («введение / основные "
    "положения / выводы / ожидаемое наполнение»).\n"
    "3. Не оценивай проект, не валидируй, не указывай ошибки, не давай "
    "рекомендации и не предлагай правки.\n"
    "4. Не упоминай технические id, card_id, JSON, PROJECT_MODEL, валидацию, "
    "RAG, источники или процесс работы интерфейса.\n"
    "5. Сохрани полноту: отрази все непустые поля и все непустые элементы "
    "карточек.\n"
    "6. Если в данных есть противоречия или незаполненные связи, просто передай "
    "то, что указано, без трактовки.\n\n"
    "7. Пиши ёмко, человеческим языком, без канцелярита и длинных конструкций. "
    "Смысл должен считываться с первого чтения.\n"
    "8. Сначала дай manifest: короткий связный манифест экрана в 2-4 предложениях "
    "(без заголовков и списков). Затем дай composition — СТРУКТУРИРОВАННЫЙ текст в "
    "лёгком markdown:\n"
    "   • группируй по реальным блокам данных; название блока — отдельной строкой «## Название»;\n"
    "   • элементы списка перечисляй маркерами «- », ведущее слово/название выделяй «**жирным**»;\n"
    "   • ключевые поля давай как «**Подпись:** значение»;\n"
    "   • используй ТОЛЬКО блоки и поля, которые есть в данных — никаких пустых рубрик.\n\n"
    "Верни ТОЛЬКО валидный JSON по схеме:\n"
    "{\n"
    '  "manifest": "короткий манифест выбранного раздела",\n'
    '  "composition": "связный текст композиции выбранного раздела"\n'
    "}\n"
)


async def compose_project(
    project_model: dict | None,
    *,
    model: str = METHODOLOG_MODEL,
) -> dict:
    """Собрать read-only композицию выбранного раздела без RAG и без правок."""
    if not isinstance(project_model, dict):
        return {
            "manifest": "",
            "composition": "В разделе пока нет данных для композиции.",
            "raw": {},
            "usage": {},
        }

    payload = json.dumps(project_model, ensure_ascii=False)
    user = (
        "PROJECT_MODEL:\n"
        f"{payload[:70000]}\n\n"
        "Собери композицию одного выбранного раздела строго из этих данных. "
        "Сначала дай короткий манифест всего композированного экрана, затем "
        "основной текст раздела. Отрази все непустые поля и элементы. Пиши "
        "ёмко, без лишнего переусложнения. Не добавляй ничего от себя."
    )
    usage = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
    try:
        raw, usage = await asyncio.to_thread(
            _chat_json, model, COMPOSITION_SYSTEM_PROMPT, user, max_tokens=6000,
        )
    except Exception as e:  # noqa: BLE001
        logger.warning(
            "compose_project: вызов модели упал (model=%s): %s: %s",
            model,
            type(e).__name__,
            str(e)[:300],
        )
        raise RuntimeError("Не удалось собрать композицию раздела. Попробуйте ещё раз.") from e
    manifest = str(raw.get("manifest") or "").strip()
    composition = str(raw.get("composition") or "").strip()
    if not composition:
        composition = "В разделе пока нет данных для композиции."
    return {"manifest": manifest, "composition": composition, "raw": raw, "usage": usage}


# ══════════════════════ Многоэтапная композиция (SSE-конвейер) ══════════════════════
# Цель — снизить расход токенов и итоговую стоимость: дорогой Opus видит уже СЖАТЫЙ
# текст, а не сырой PROJECT_MODEL. Этапы:
#   1) collect   — deepseek-v4-pro: сбор данных + черновая композиция (весь PROJECT_MODEL);
#   2) structure — claude-sonnet-4.6: структурирование, перевод на ясный язык, сжатие;
#   3) review    — claude-opus-4.8: ёмкие рекомендации (только сжатый текст → короткий JSON);
#   4) finalize  — claude-sonnet-4.6: финальные правки по рекомендациям.
# Этап 4 пропускается, если рецензент вернул verdict='ok' / пустой список (экономия).
# Каждый этап коммитится в БД сразу (project_cards.save_composition_stage) → защита от
# падения: обрыв SSE / рестарт сервера теряют максимум один незавершённый этап.

COMPOSE_COLLECT_MODEL = "deepseek/deepseek-v4-pro"
COMPOSE_STRUCTURE_MODEL = "anthropic/claude-sonnet-4.6"
COMPOSE_REVIEW_MODEL = "anthropic/claude-opus-4.8"
COMPOSE_FINALIZE_MODEL = "anthropic/claude-sonnet-4.6"

# Человекочитаемые подписи этапов для прогресс-степпера на фронте.
COMPOSE_STAGES = [
    {"key": "collect", "no": 1, "model": COMPOSE_COLLECT_MODEL, "title": "Сбор данных и черновик"},
    {"key": "structure", "no": 2, "model": COMPOSE_STRUCTURE_MODEL, "title": "Структурирование и ясный язык"},
    {"key": "review", "no": 3, "model": COMPOSE_REVIEW_MODEL, "title": "Проверка и рекомендации"},
    {"key": "finalize", "no": 4, "model": COMPOSE_FINALIZE_MODEL, "title": "Финальные правки"},
]

# Честный ответ для пустого раздела — чтобы не запускать модели и не плодить шаблон-болванку.
_SECTION_EMPTY_MSG = "В этом разделе пока нет данных для композиции."


def _has_section_content(project_model: dict | None) -> bool:
    """Есть ли в разделе хоть что-то для пересказа.

    Источник — компактный пересказ экрана (project_model['compact']): он содержит
    ТОЛЬКО заполненные поля и элементы, поэтому любое значение = реальное содержание.
    Защита от галлюцинации: на пустом разделе модели склонны выдумывать шаблон
    документа — если содержимого нет, конвейер не запускаем.
    """
    if not isinstance(project_model, dict):
        return False
    blocks = project_model.get("blocks")
    if isinstance(blocks, list):
        for blk in blocks:
            if isinstance(blk, dict) and str(blk.get("text") or "").strip():
                return True
    if str(project_model.get("text") or "").strip():
        return True
    if str(project_model.get("context_text") or "").strip():
        return True
    compact = project_model.get("compact")
    if isinstance(compact, dict):
        for fld in compact.get("fields") or []:
            if isinstance(fld, dict) and str(fld.get("value") or "").strip():
                return True
        for group in compact.get("groups") or []:
            for item in (group.get("items") or []):
                for fld in (item.get("fields") or []) if isinstance(item, dict) else []:
                    if isinstance(fld, dict) and str(fld.get("value") or "").strip():
                        return True
    return False


STRUCTURE_SYSTEM_PROMPT = (
    "Ты — редактор-методолог. Тебе дают ЧЕРНОВУЮ композицию одного раздела проекта "
    "(manifest + composition), уже собранную из данных проекта.\n\n"
    "ЗАДАЧА: сделать из черновика ЧИТАЕМЫЙ, структурированный текст на ясном "
    "человеческом языке — убрать канцелярит, повторы и воду, разбить сплошное полотно "
    "на блоки, чтобы смысл считывался с первого прочтения.\n\n"
    "ЖЁСТКИЕ ПРАВИЛА:\n"
    "1. Сохрани ВСЕ конкретные факты, цифры, названия и элементы из черновика — ничего "
    "важного не теряй.\n"
    "2. СТРУКТУРИРУЙ в лёгком markdown: группируй по реальным блокам, заголовок блока — "
    "строкой «## Название»; элементы — маркерами «- » с ведущим «**словом**»; ключевые "
    "поля — «**Подпись:** значение». Заголовки и пункты бери ТОЛЬКО из реальных данных.\n"
    "3. Ничего НЕ придумывай. НЕ создавай разделы, заголовки или пункты, которых нет в "
    "данных, и не строй абстрактный шаблон («введение / основные положения / выводы / "
    "ожидаемое наполнение»).\n"
    "4. Не оценивай проект, не указывай ошибки, не давай рекомендаций.\n"
    "5. Не упоминай технические id, JSON, модель или процесс.\n\n"
    "Верни ТОЛЬКО валидный JSON по схеме:\n"
    '{\n  "manifest": "сжатый манифест раздела (без заголовков/списков)",\n'
    '  "composition": "структурированный markdown-текст раздела"\n}\n'
)

REVIEW_SYSTEM_PROMPT = (
    "Ты — рецензент-редактор. Тебе дают ГОТОВЫЙ текст-пересказ одного раздела проекта "
    "(manifest + composition). Композиция — это пересказ того, что уже внесено в раздел, "
    "в режиме «только чтение».\n\n"
    "ЗАДАЧА: проверить КАЧЕСТВО ИЗЛОЖЕНИЯ — ясность, человеческий язык, связность и "
    "верность данным (не выдумано ли лишнее, не потерян ли реальный факт). Ты НЕ судишь "
    "полноту проекта и НЕ проверяешь, всё ли заполнено.\n\n"
    "СТРОГО ЗАПРЕЩЕНО рекомендовать:\n"
    "• добавить содержание, факты или данные, которых нет;\n"
    "• придумать структуру, разделы, подразделы, заголовки или «ожидаемое наполнение»;\n"
    "• «заполнить» раздел на том основании, что он пустой или неполный.\n"
    "Если раздел пуст — для пересказа это нормально; НЕ предлагай его наполнять.\n\n"
    "МОЖНО рекомендовать ТОЛЬКО: упростить формулировку, убрать выдуманное/шаблонное, "
    "вернуть потерянный из данных факт, сделать язык понятнее и человечнее.\n"
    "ПРАВИЛА ЭКОНОМИИ: не переписывай и не цитируй текст целиком; каждая рекомендация — "
    "ОДНО короткое предложение; максимум 6; только существенное. Если изложение верное, "
    "ясное и ничего не выдумано — верни verdict 'ok' и пустой список.\n\n"
    "Верни ТОЛЬКО валидный JSON по схеме:\n"
    '{\n  "verdict": "ok | revise",\n'
    '  "recommendations": ["короткая правка 1", "короткая правка 2"]\n}\n'
)

FINALIZE_SYSTEM_PROMPT = (
    "Ты — редактор-методолог. Тебе дают текст-пересказ одного раздела проекта (manifest + "
    "composition) и список правок рецензента. Композиция — пересказ уже введённых данных "
    "в режиме «только чтение».\n\n"
    "ЗАДАЧА: внести правки, касающиеся ТОЛЬКО формулировки, ясности и языка. Сохрани все "
    "факты, пиши ясно и человечно.\n\n"
    "ЖЁСТКИЕ ПРАВИЛА:\n"
    "1. ИГНОРИРУЙ любую правку, требующую добавить НОВОЕ содержание/факты или придумать "
    "блоки, которых нет в данных. Форматирование по РЕАЛЬНЫМ данным (заголовки «## », "
    "маркеры «- », «**жирный**», «**Подпись:** значение») — сохраняй и можешь улучшать "
    "ради читаемости.\n"
    "2. Не выдумывай ничего сверх исходного текста. Если в тексте сказано, что данных нет — "
    "оставь это честно, не превращай в шаблон-болванку.\n"
    "3. Не теряй конкретные факты, цифры, названия и элементы.\n"
    "4. Не упоминай технические id, JSON, модель или процесс.\n\n"
    "Верни ТОЛЬКО валидный JSON по схеме:\n"
    '{\n  "manifest": "финальный манифест раздела",\n'
    '  "composition": "финальный текст раздела"\n}\n'
)


def _compose_clean(raw: dict) -> dict:
    """Нормализовать ответ модели этапа в {manifest, composition}."""
    manifest = str(raw.get("manifest") or "").strip()
    composition = str(raw.get("composition") or "").strip()
    if not composition:
        composition = "В разделе пока нет данных для композиции."
    return {"manifest": manifest, "composition": composition}


def _section_text(section: dict) -> str:
    return (
        f"МАНИФЕСТ: {section.get('manifest') or '—'}\n\n"
        f"ТЕКСТ:\n{section.get('composition') or '—'}"
    )


def _run_collect(project_model: dict | None) -> dict:
    """Этап 1 — deepseek-v4-pro: собрать черновую композицию из всего PROJECT_MODEL."""
    if not isinstance(project_model, dict):
        return {"manifest": "", "composition": "В разделе пока нет данных для композиции."}
    payload = json.dumps(project_model, ensure_ascii=False)
    user = (
        "PROJECT_MODEL — компактный текстовый пересказ выбранного экрана: в поле text дано "
        "реальное содержимое экрана (заголовки блоков «###», элементы «•», строки "
        "«Метка: значение»). Пустых заглушек здесь нет; project/section — мета.\n"
        f"{payload[:70000]}\n\n"
        "Собери композицию этого раздела строго из приведённых данных (поле text). Сначала "
        "дай короткий манифест экрана, затем структурированный текст. Отрази ВСЕ блоки, "
        "элементы и значения из text. Пиши ёмко, человеческим языком. Не добавляй ничего "
        "от себя и не выдумывай блоков, которых нет."
    )
    raw, usage = _chat_json(COMPOSE_COLLECT_MODEL, COMPOSITION_SYSTEM_PROMPT, user, max_tokens=6000)
    logger.info("compose stage=collect usage=%s", usage)
    return _compose_clean(raw)


def _run_structure(draft: dict) -> dict:
    """Этап 2 — claude-sonnet-4.6: структурировать и сжать черновик (без потери фактов)."""
    user = (
        "ЧЕРНОВАЯ КОМПОЗИЦИЯ:\n"
        f"{_section_text(draft)}\n\n"
        "Структурируй и перепиши ёмко на ясном языке, сохрани все факты черновика. "
        "Верни JSON {manifest, composition}."
    )
    raw, usage = _chat_json(COMPOSE_STRUCTURE_MODEL, STRUCTURE_SYSTEM_PROMPT, user, max_tokens=4000)
    logger.info("compose stage=structure usage=%s", usage)
    return _compose_clean(raw)


def _run_review(structured: dict) -> dict:
    """Этап 3 — claude-opus-4.8: ёмкие рекомендации (минимум токенов на входе и выходе)."""
    user = (
        "ТЕКСТ РАЗДЕЛА:\n"
        f"{_section_text(structured)}\n\n"
        "Дай ёмкие правки по схеме. Если всё хорошо — verdict 'ok', recommendations []."
    )
    raw, usage = _chat_json(COMPOSE_REVIEW_MODEL, REVIEW_SYSTEM_PROMPT, user, max_tokens=800)
    logger.info("compose stage=review usage=%s", usage)
    verdict = str(raw.get("verdict") or "").strip().lower()
    if verdict not in {"ok", "revise"}:
        verdict = "revise"
    recs = [str(r).strip() for r in (raw.get("recommendations") or []) if str(r).strip()][:6]
    if not recs:
        verdict = "ok"
    return {"verdict": verdict, "recommendations": recs}


def _run_finalize(structured: dict, recommendations: list[str]) -> dict:
    """Этап 4 — claude-sonnet-4.6: внести правки рецензента, сохранив факты."""
    recs_block = "\n".join(f"• {r}" for r in recommendations) or "—"
    user = (
        "ТЕКСТ РАЗДЕЛА:\n"
        f"{_section_text(structured)}\n\n"
        f"ПРАВКИ РЕЦЕНЗЕНТА:\n{recs_block}\n\n"
        "Внеси только эти правки, сохрани все факты. Верни JSON {manifest, composition}."
    )
    raw, usage = _chat_json(COMPOSE_FINALIZE_MODEL, FINALIZE_SYSTEM_PROMPT, user, max_tokens=4000)
    logger.info("compose stage=finalize usage=%s", usage)
    return _compose_clean(raw)


# ── Блочная композиция (Вариант A): пересобираем только изменённые блоки ──
# Исходный текст экрана делится на блоки (по «### Заголовок»). Для каждого блока
# храним хеш исходных данных и его готовый текст. При повторной сборке блок с тем же
# хешом берём из кэша как есть (без модели) — меняется только тот блок, чьи данные
# изменились. Это и стабилизирует текст, и экономит токены.

BLOCK_COLLECT_SYSTEM = (
    "Ты — ИИ-Методолог. Тебе дают данные ОДНОГО блока экрана проекта. Перескажи их "
    "связным человеческим языком СТРОГО из этих данных. Ничего не выдумывай и не добавляй "
    "блоков/полей, которых нет. НЕ пиши заголовок самого блока — только его содержимое.\n"
    'Верни ТОЛЬКО валидный JSON: {"composition": "markdown-текст блока"}.'
)

BLOCK_STRUCTURE_SYSTEM = (
    "Ты — редактор. Сделай текст блока читаемым и структурным в лёгком markdown: элементы — "
    "маркерами «- » с ведущим «**названием**»; поля — строкой «**Подпись:** значение». "
    "Сохрани ВСЕ факты, ничего не придумывай, НЕ добавляй заголовок самого блока.\n"
    'Верни ТОЛЬКО валидный JSON: {"composition": "markdown-текст блока"}.'
)

MANIFEST_SYSTEM = (
    "Ты пишешь короткий манифест раздела — 2-4 плотных предложения о том, ЧТО в разделе. "
    "Строго по данному тексту, без выдумок, без заголовков и списков.\n"
    'Верни ТОЛЬКО валидный JSON: {"manifest": "короткий манифест"}.'
)


def _block_hash(text: str) -> str:
    return hashlib.sha256((text or "").encode("utf-8")).hexdigest()[:16]


def _payload_blocks(project_model: dict | None) -> list[dict]:
    """Нормализовать вход в список блоков [{id, title, text}] (с непустым text).

    Поддерживает старый payload без blocks (поле text) — тогда один блок целиком.
    """
    out: list[dict] = []
    if not isinstance(project_model, dict):
        return out
    raw_blocks = project_model.get("blocks")
    if isinstance(raw_blocks, list) and raw_blocks:
        for b in raw_blocks:
            if not isinstance(b, dict):
                continue
            text = str(b.get("text") or "").strip()
            if not text:
                continue
            title = str(b.get("title") or "").strip()
            bid = str(b.get("id") or title or f"b{len(out)}").strip() or f"b{len(out)}"
            out.append({"id": bid, "title": title, "text": text})
        return out
    text = str(project_model.get("text") or project_model.get("context_text") or "").strip()
    if text:
        out.append({"id": "_all", "title": "", "text": text})
    return out


def _run_block(title: str, text: str) -> str:
    """Собрать ОДИН блок: deepseek (пересказ данных) → sonnet (читаемый markdown).

    Возвращает markdown-тело блока без заголовка (заголовок добавляется при сборке).
    """
    head = f"Блок: «{title}».\n" if title else ""
    u1 = head + "Данные блока:\n" + text + "\n\nПерескажи строго эти данные. Верни JSON {composition}."
    raw1, us1 = _chat_json(COMPOSE_COLLECT_MODEL, BLOCK_COLLECT_SYSTEM, u1, max_tokens=2500)
    draft = str(raw1.get("composition") or "").strip() or text
    u2 = head + "Текст блока:\n" + draft + "\n\nСделай читаемо и структурно, сохрани все факты. Верни JSON {composition}."
    raw2, us2 = _chat_json(COMPOSE_STRUCTURE_MODEL, BLOCK_STRUCTURE_SYSTEM, u2, max_tokens=2500)
    body = str(raw2.get("composition") or "").strip() or draft
    # Заголовок блока добавляем при сборке детерминированно — снимаем дубль, если модель его всё же вписала.
    if title:
        body = re.sub(rf"^\s*#{{1,6}}\s*{re.escape(title)}\s*\n", "", body, count=1, flags=re.IGNORECASE).strip()
    logger.info("compose block=%s usage_collect=%s usage_structure=%s", title or "_all", us1, us2)
    return body


def _run_manifest(composition: str) -> str:
    user = (
        "Текст раздела:\n" + composition[:8000] + "\n\n"
        "Дай короткий манифест (2-4 предложения, без заголовков и списков). Верни JSON {manifest}."
    )
    raw, usage = _chat_json(COMPOSE_STRUCTURE_MODEL, MANIFEST_SYSTEM, user, max_tokens=600)
    logger.info("compose manifest usage=%s", usage)
    return str(raw.get("manifest") or "").strip()


def _assemble_blocks(order: list[str], cache: dict) -> str:
    """Собрать финальную композицию: «## Заголовок» (детерминированно) + тело блока."""
    parts: list[str] = []
    for bid in order:
        b = cache.get(bid)
        if not isinstance(b, dict):
            continue
        body = str(b.get("composition") or "").strip()
        if not body:
            continue
        title = str(b.get("title") or "").strip()
        parts.append(f"## {title}\n{body}" if title else body)
    return "\n\n".join(parts)


def _sse(payload: dict) -> str:
    """Сериализовать событие в формат SSE (как в agent_network.stream_network)."""
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _stage_event(key: str, status: str, **extra) -> dict:
    meta = next((s for s in COMPOSE_STAGES if s["key"] == key), {"no": 0, "model": ""})
    return {"type": "stage", "stage": key, "stage_no": meta["no"],
            "model": meta["model"], "status": status, **extra}


async def compose_stream(
    db: AsyncSession,
    project_id: int,
    card_id: str,
    project_model: dict | None,
    mode: str = "incremental",
) -> AsyncGenerator[str, None]:
    """SSE-композиция раздела по блокам. Два режима под две кнопки UI:

    • mode='incremental' (по умолчанию) — «Обновить изменённое»: пересобираем ТОЛЬКО
      блоки, чьи данные изменились (кэш по хешу). Дёшево, текст стабилен. Без Opus.
    • mode='full' — «Композиция раздела» (полная сборка): принудительно пересобираем
      ВСЕ блоки (deepseek→sonnet), затем один проход сильной модели на весь раздел —
      review (Opus) → finalize (sonnet). Блок-кэш при этом остаётся валидным, поэтому
      последующее «Обновить изменённое» снова работает инкрементально.

    Для каждого блока: если хеш его исходных данных совпал с сохранённым — берём готовый
    текст из кэша (без вызова модели, status='cached'); иначе пересобираем только этот блок.
    Так при точечной правке проекта меняется лишь изменённый блок, остальной текст —
    прежний (байт-в-байт). Прогресс — события type='block', финал — type='done'.
    Каждый блок коммитится сразу → готовые блоки переживают обрыв соединения/рестарт.
    """
    blocks = _payload_blocks(project_model)
    ckpt = await project_cards.get_composition(db, project_id, card_id)
    cache = ckpt.get("block_cache") if isinstance(ckpt.get("block_cache"), dict) else {}

    # Раздел пуст → честный ответ без вызова моделей.
    if not blocks:
        empty = {"manifest": "", "composition": _SECTION_EMPTY_MSG}
        await project_cards.save_composition_stage(
            db, project_id, card_id,
            patch={"status": "done", "block_cache": {}, "order": [], "manifest": "", "final": empty},
        )
        yield _sse({"type": "done", **empty})
        return

    new_cache: dict = {}
    order: list[str] = []
    any_changed = False
    try:
        for blk in blocks:
            bid, title, text = blk["id"], blk["title"], blk["text"]
            order.append(bid)
            h = _block_hash(text)
            prev = cache.get(bid)
            # Хеш совпал → блок не менялся: берём готовый текст из кэша.
            # В режиме full (полная сборка) кэш игнорируем — пересобираем каждый блок.
            if mode != "full" and isinstance(prev, dict) and prev.get("hash") == h and str(prev.get("composition") or "").strip():
                new_cache[bid] = {"hash": h, "title": title, "composition": prev["composition"]}
                yield _sse({"type": "block", "id": bid, "title": title, "status": "cached"})
                continue
            any_changed = True
            yield _sse({"type": "block", "id": bid, "title": title, "status": "running"})
            extra: dict = {}
            try:
                body = await asyncio.to_thread(_run_block, title, text)
                status = "done"
            except Exception as exc:  # noqa: BLE001 — откат к прежней версии блока или сырому тексту
                logger.warning("compose block %r failed: %s", title, exc)
                body = (prev.get("composition") if isinstance(prev, dict) else None) or text
                status = "fallback"
                extra = {"error": str(exc)[:160]}
            new_cache[bid] = {"hash": h, "title": title, "composition": body}
            await project_cards.save_composition_stage(
                db, project_id, card_id,
                patch={"status": "running", "block_cache": new_cache, "order": order},
            )
            yield _sse({"type": "block", "id": bid, "title": title, "status": status, **extra})

        composition = _assemble_blocks(order, new_cache) or _SECTION_EMPTY_MSG
        # Манифест регенерим только если что-то менялось (иначе оставляем прежний — стабильность).
        manifest = str(ckpt.get("manifest") or "").strip()
        if any_changed or not manifest:
            try:
                manifest = await asyncio.to_thread(_run_manifest, composition)
            except Exception as exc:  # noqa: BLE001
                logger.warning("compose manifest failed: %s", exc)

        # Полная сборка: «второе мнение» сильной модели на весь собранный раздел.
        # Opus даёт ёмкие правки по ИЗЛОЖЕНИЮ → sonnet их вносит (только если есть что вносить).
        if mode == "full":
            structured = {"manifest": manifest, "composition": composition}
            yield _sse(_stage_event("review", "running"))
            try:
                review = await asyncio.to_thread(_run_review, structured)
                yield _sse(_stage_event("review", "done", recommendations=review["recommendations"]))
            except Exception as exc:  # noqa: BLE001 — провал ревью не валит сборку
                logger.warning("compose full review failed: %s", exc)
                review = {"verdict": "ok", "recommendations": []}
                yield _sse(_stage_event("review", "fallback", error=str(exc)[:160]))
            if review["verdict"] == "revise" and review["recommendations"]:
                yield _sse(_stage_event("finalize", "running"))
                try:
                    polished = await asyncio.to_thread(_run_finalize, structured, review["recommendations"])
                    manifest = polished.get("manifest") or manifest
                    composition = polished.get("composition") or composition
                    yield _sse(_stage_event("finalize", "done"))
                except Exception as exc:  # noqa: BLE001 — оставляем до-финальный текст
                    logger.warning("compose full finalize failed: %s", exc)
                    yield _sse(_stage_event("finalize", "fallback", error=str(exc)[:160]))
            else:
                yield _sse(_stage_event("finalize", "skipped"))

        final = {"manifest": manifest, "composition": composition}
        await project_cards.save_composition_stage(
            db, project_id, card_id,
            patch={"status": "done", "block_cache": new_cache, "order": order,
                   "manifest": manifest, "final": final},
        )
        yield _sse({"type": "done", **final})

    except asyncio.CancelledError:
        # Клиент отключился (обновление страницы) — готовые блоки уже в БД, выходим.
        raise
    except Exception as exc:  # noqa: BLE001 — крайний случай: отдаём лучший доступный текст
        logger.warning("compose_stream failed: %s", exc)
        prev_final = ckpt.get("final") if isinstance(ckpt.get("final"), dict) else {}
        best_comp = _assemble_blocks(order, new_cache) or str(prev_final.get("composition") or "") \
            or "Не удалось собрать композицию раздела. Попробуйте ещё раз."
        try:
            await project_cards.save_composition_stage(
                db, project_id, card_id, patch={"status": "failed", "error": str(exc)[:200]},
            )
        except Exception:  # noqa: BLE001
            await db.rollback()
        yield _sse({"type": "error", "error": str(exc)[:200]})
        yield _sse({"type": "done", "manifest": str(prev_final.get("manifest") or ""), "composition": best_comp})


async def chat_methodolog(
    message: str,
    *,
    history: list[dict] | None = None,
    project_model: dict | None = None,
    review: dict | None = None,
    fast_model: str = METHODOLOG_MODEL,
    strong_model: str = METHODOLOG_MODEL,
    focus_card_id: str | None = None,
    deep: bool = False,
    mode: str = "fill",
    plan: dict | None = None,
    source_keys: list[str] | None = None,
) -> dict:
    """Диалог-уточнение с предложениями правок (без самостоятельного применения).

    Экономия токенов (поиск чат-модель не тратит — он на эмбеддингах+Postgres):
      • intent по сообщению (classify_intent) выбирает модель и объём контекста;
      • light → fast_model, сжатая карта (фокус-карточка целиком, прочие без значений);
      • heavy → strong_model, та же фокус-сжатая карта;
      • whole → strong_model, полная карта проекта.
      • deep=True («глубокий разбор» из UI) форсит сильную модель: light повышается до heavy,
        явный whole не понижается.

    Возврат: {reply, proposals[], evidence[], intent, model, usage}.
    """
    planning = mode == "plan"
    intent = classify_intent(message)
    if deep and intent == "light":
        intent = "heavy"
    # Заполнение по согласованному плану — всегда сильная модель, даже если команда короткая
    # («приступай», «заполняй»): иначе классификатор примет её за light и возьмёт слабую модель.
    if not planning and intent == "light" and isinstance(plan, dict) and (plan.get("text") or plan.get("questions")):
        intent = "heavy"
    if planning:
        # Планирование — всегда сильная модель и развёрнутый ответ; фокус-карточку видим целиком.
        model = strong_model
        max_tokens = 4000
        model_for_prompt = _compact_project_model(project_model, focus_card_id)
    else:
        model = strong_model if intent in ("heavy", "whole") else fast_model
        # Заполнение целой карточки — это десятки правок; даём большой потолок вывода,
        # чтобы JSON не обрывался (а если всё же оборвётся — спасаем готовое в _chat_json).
        max_tokens = 15000 if intent in ("heavy", "whole") else 1500
        # whole — нужен весь проект; light/heavy — фокус-карточка целиком, прочие сжато.
        model_for_prompt = project_model if intent == "whole" else _compact_project_model(project_model, focus_card_id)
    focused = model_for_prompt is not project_model and focus_card_id and focus_card_id != "whole-project"

    hits = await search(message, scope="both", source_keys=source_keys, limit=MAX_EVIDENCE)
    evidence, labels = _evidence_block(hits)

    history_text = ""
    for m in (history or [])[-10:]:
        role = "Пользователь" if m.get("role") == "user" else "Методолог"
        history_text += f"{role}: {str(m.get('content') or '').strip()}\n"

    parts = []
    if model_for_prompt is not None:
        if focused:
            parts.append(
                f"ОТКРЫТЫЙ ЭКРАН (FOCUS): card_id={focus_card_id}. Его содержимое дано ПОЛНОСТЬЮ; "
                "остальные карточки — сжато (структура и id без значений) для согласованности. "
                "Разбирай и заполняй прежде всего фокус-карточку."
            )
        parts.append("PROJECT_MODEL (редактируемые цели):\n" + json.dumps(model_for_prompt, ensure_ascii=False)[:60000])
    if review is not None:
        parts.append("REVIEW (последняя оценка):\n" + json.dumps(
            {"overall": review.get("overall"), "summary": review.get("summary"),
             "sections": review.get("sections")}, ensure_ascii=False)[:6000])
    plan_block = _format_plan(plan)
    if plan_block:
        parts.append(plan_block)
    if history_text:
        parts.append("ИСТОРИЯ ДИАЛОГА:\n" + history_text)
    parts.append("СООБЩЕНИЕ ПОЛЬЗОВАТЕЛЯ:\n" + (message or "").strip())
    parts.append(
        "НАЙДЕННЫЕ ВЫДЕРЖКИ:\n" + (evidence if hits else "(ничего не найдено)")
    )
    if planning:
        parts.append(PLAN_INSTRUCTION)
    else:
        parts.append(
            "РЕЖИМ ЗАПОЛНЕНИЯ. Верни правки СРАЗУ как массив proposals — не описывай план словами, "
            "не перечисляй, что «собираешься сделать», и НЕ проси отдельного подтверждения (пользователь "
            "подтверждает каждую правку сам). reply — максимум одно короткое предложение. "
            "Вноси ровно то, о чём просьба (согласованный план или сообщение пользователя), не расширяя объём. "
            "human и rationale держи КОРОТКИМИ (одна строка), без воды — это экономит место для правок."
        )
    user = "\n\n".join(parts)

    usage = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
    try:
        raw, usage = await asyncio.to_thread(_chat_json, model, CHAT_SYSTEM_PROMPT, user, max_tokens=max_tokens)
    except Exception as e:  # noqa: BLE001
        logger.warning(
            "chat_methodolog: вызов модели упал (mode=%s, intent=%s, model=%s): %s: %s",
            mode, intent, model, type(e).__name__, str(e)[:300],
        )
        raw = {"reply": "Не удалось получить ответ модели. Попробуйте ещё раз.", "proposals": [],
               "_error": f"{type(e).__name__}: {str(e)[:160]}"}

    # В режиме планирования правки НЕ отдаём, даже если модель их вернула вопреки инструкции.
    proposals = [] if planning else _sanitize_proposals(raw.get("proposals"))
    questions: list[str] = []
    if planning and isinstance(raw.get("questions"), list):
        questions = [str(q).strip() for q in raw["questions"] if str(q).strip()][:12]
    return {
        "reply": str(raw.get("reply") or "").strip() or "—",
        "proposals": proposals,
        "questions": questions,
        "evidence": _evidence_out(hits),
        "intent": intent,
        "model": model,
        "mode": mode,
        "raw": raw,
        "usage": usage,
    }
