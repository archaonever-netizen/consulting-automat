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
import json
import logging
import re

from .knowledge_search import search, SearchHit
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
    "Будь строг: пустой или почти пустой раздел — это red, а не amber.\n\n"
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
    "  • Заполняй элемент ЦЕЛИКОМ: в values указывай значения для всех ключевых полей элемента (см. item_fields), "
    "а не для одного.\n"
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
            "Ответь по схеме. Предлагай правки только как proposals, ничего не применяй сам. "
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
