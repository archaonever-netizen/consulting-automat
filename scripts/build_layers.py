"""Generate Russian derived layers for a knowledge source (the Methodolog's cards).

For each substantive fragment it asks a Promptra chat model to extract, IN RUSSIAN
and grounded ONLY in that fragment's text:
  - method cards (карточки методик)
  - typical errors (типичные ошибки)
  - diagnostic questions (диагностические вопросы)
Each card is linked to its real source fragment + page, so citations are honest.
Plus one document-level Russian summary layer.

Original English fragments are never modified — they remain the citation source.

Economical + idempotent: a per-fragment state row (knowledge_generation_state)
stores a content hash; unchanged fragments are skipped on re-run (even those that
produced zero cards), so nothing is re-generated and no spend is wasted.

Postgres only. DB from DATABASE_URL (point at Supabase).

    python scripts/build_layers.py --source bpmm [--model google/gemini-3.1-flash-lite] [--limit N]
"""
from __future__ import annotations

import argparse
import asyncio
import json
import re
import sys
from hashlib import sha256
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.core.config import get_settings  # noqa: E402

GENERATOR = "cards_v1"
DEFAULT_MODEL = "google/gemini-3.1-flash-lite"
CONCURRENCY = 4
MIN_TEXT_CHARS = 200
MAX_INPUT_CHARS = 12000
# Front-matter titles that almost never carry methodology content.
SKIP_TITLE_HINTS = (
    "preface", "table of contents", "copyright", "notice", "trademark",
    "acknowledg", "about the object management", "list of figures", "list of tables",
)

SYSTEM_PROMPT = (
    "Ты — старший методолог-консультант. На входе фрагмент англоязычного стандарта "
    "(название раздела, страница, текст). Твоя задача — извлечь производные знания "
    "СТРОГО на основе ЭТОГО фрагмента, НА РУССКОМ языке. Ничего не выдумывай и не "
    "добавляй из общих знаний — только то, что есть в тексте фрагмента. Если фрагмент "
    "служебный или без методического содержания — верни пустые массивы.\n\n"
    "Верни ТОЛЬКО валидный JSON по схеме:\n"
    "{\n"
    '  "method_cards": [{"title": "кратко", "maturity_level": "если упомянут, иначе пусто", "body": "2-5 предложений"}],\n'
    '  "typical_errors": [{"title": "кратко", "body": "2-5 предложений: типичная ошибка по теме фрагмента и чем грозит"}],\n'
    '  "diagnostic_questions": [{"title": "кратко", "body": "вопрос(ы) для диагностики зрелости по теме фрагмента"}]\n'
    "}\n\n"
    "Правила: 0–2 элемента каждого типа; русский деловой язык; не указывай номера "
    "страниц в тексте (ссылку добавим автоматически); не копируй английский текст дословно — пересказывай."
)


def _hash(text: str) -> str:
    return sha256(f"{GENERATOR}|{text}".encode("utf-8")).hexdigest()


def _pg_dsn() -> str:
    raw = get_settings().database_url
    if raw.startswith("sqlite"):
        raise SystemExit("Layer generation requires Postgres/Supabase. Set DATABASE_URL.")
    return raw.replace("postgresql+asyncpg://", "postgresql://").replace(
        "postgres+asyncpg://", "postgres://"
    )


def _extract_json(raw: str) -> dict:
    s = raw.strip()
    fence = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", s, re.DOTALL)
    if fence:
        s = fence.group(1)
    else:
        i, j = s.find("{"), s.rfind("}")
        if i != -1 and j != -1:
            s = s[i:j + 1]
    return json.loads(s)


def _chat(model: str, system: str, user: str, max_tokens: int = 1400) -> tuple[str, int]:
    from openai import OpenAI
    settings = get_settings()
    client = OpenAI(api_key=settings.promptra_api_key, base_url=settings.promptra_base_url, timeout=120)
    resp = client.chat.completions.create(
        model=model,
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        temperature=0.2,
        max_tokens=max_tokens,
    )
    usage = getattr(resp, "usage", None)
    tokens = int(getattr(usage, "total_tokens", 0) or 0)
    return (resp.choices[0].message.content or ""), tokens


def _generate_for_fragment(model: str, frag: dict) -> tuple[dict | None, int]:
    user = (
        f"Раздел: {frag['title']}\n"
        f"Страница: {frag['page_start']}–{frag['page_end']}\n\n"
        f"Текст фрагмента:\n{frag['text'][:MAX_INPUT_CHARS]}"
    )
    try:
        raw, tokens = _chat(model, SYSTEM_PROMPT, user)
        return _extract_json(raw), tokens
    except Exception as e:  # noqa: BLE001
        print(f"  ! fragment {frag['id']} failed: {type(e).__name__}: {str(e)[:120]}")
        return None, 0


def _is_skippable(title: str, text: str) -> bool:
    if len(text.strip()) < MIN_TEXT_CHARS:
        return True
    low = title.lower()
    return any(h in low for h in SKIP_TITLE_HINTS)


async def _write_fragment_cards(conn, frag: dict, parsed: dict, model: str, fhash: str) -> int:
    async with conn.transaction():
        # Clean replace for this fragment only.
        await conn.execute(
            "DELETE FROM knowledge_cards WHERE supporting_fragment_id = $1", frag["id"]
        )
        written = 0
        type_map = [
            ("method_card", "method_cards"),
            ("typical_error", "typical_errors"),
            ("diagnostic_question", "diagnostic_questions"),
        ]
        for card_type, json_key in type_map:
            for idx, item in enumerate(parsed.get(json_key, []) or []):
                title = (item.get("title") or "").strip()
                body = (item.get("body") or "").strip()
                if not title or not body:
                    continue
                await conn.execute(
                    "INSERT INTO knowledge_cards "
                    "(source_id, card_type, card_key, methodology, maturity_level, title, body, "
                    " content_origin, lang, confidential, supporting_fragment_id, page_start, page_end, "
                    " source_ref, sort_order, content_hash, metadata_json) "
                    "VALUES ($1,$2,$3,$4,$5,$6,$7,'ai_generated','ru',$8,$9,$10,$11,$12,$13,$14,$15) "
                    "ON CONFLICT (source_id, card_key) DO UPDATE SET "
                    " title=EXCLUDED.title, body=EXCLUDED.body, maturity_level=EXCLUDED.maturity_level, "
                    " page_start=EXCLUDED.page_start, page_end=EXCLUDED.page_end, source_ref=EXCLUDED.source_ref, "
                    " content_hash=EXCLUDED.content_hash, updated_at=now()",
                    frag["source_id"], card_type, f"{card_type}:f{frag['id']}:{idx}",
                    frag["methodology"], (item.get("maturity_level") or "").strip() or None,
                    title[:300], body, frag["confidential"], frag["id"],
                    frag["page_start"], frag["page_end"], frag["source_ref"], idx, fhash,
                    json.dumps({"fragment_title": frag["title"]}, ensure_ascii=False),
                )
                written += 1
        await conn.execute(
            "INSERT INTO knowledge_generation_state (owner_type, owner_id, generator, content_hash, model_name) "
            "VALUES ('fragment',$1,$2,$3,$4) "
            "ON CONFLICT (owner_type, owner_id, generator) DO UPDATE SET "
            "content_hash=EXCLUDED.content_hash, model_name=EXCLUDED.model_name, updated_at=now()",
            frag["id"], GENERATOR, fhash, model,
        )
        return written


async def _gen_doc_summary(conn, source_id: int, source_key: str, model: str) -> int:
    exists = await conn.fetchval(
        "SELECT 1 FROM knowledge_source_layers WHERE source_id=$1 AND layer_type='description_ru'",
        source_id,
    )
    if exists:
        print("  doc summary (ru): already exists, skipped")
        return 0
    titles = await conn.fetch(
        "SELECT title FROM knowledge_source_fragments WHERE source_id=$1 ORDER BY sort_order LIMIT 60",
        source_id,
    )
    outline = "\n".join(f"- {r['title']}" for r in titles)
    user = (
        f"Документ: {source_key}. Ниже оглавление (английское). Напиши КРАТКОЕ описание "
        f"документа НА РУССКОМ (3–5 предложений): о чём он, для чего применяется, кому полезен. "
        f"Только по оглавлению, без выдумок.\n\nОглавление:\n{outline}"
    )
    try:
        text, doc_tokens = await asyncio.to_thread(
            _chat, model, "Ты — методолог. Пиши деловой русский.", user, 500)
        text = text.strip()
        if text:
            await conn.execute(
                "INSERT INTO knowledge_source_layers "
                "(source_id, layer_type, title, content, content_origin, sort_order, created_at) "
                "VALUES ($1,'description_ru','Краткое описание (RU)',$2,'ai_generated',5, now())",
                source_id, text,
            )
            print("  doc summary (ru): created")
        return doc_tokens
    except Exception as e:  # noqa: BLE001
        print(f"  doc summary failed: {type(e).__name__}: {str(e)[:120]}")
        return 0


async def run(source_key: str, model: str, limit: int | None) -> None:
    import asyncpg
    conn = await asyncpg.connect(_pg_dsn(), timeout=30, statement_cache_size=0)
    try:
        src = await conn.fetchrow("SELECT id FROM knowledge_sources WHERE key=$1", source_key)
        if not src:
            raise SystemExit(f"source '{source_key}' not found")
        source_id = src["id"]

        rows = await conn.fetch(
            "SELECT id, source_id, title, full_text AS text, page_start, page_end, source_ref, "
            "methodology, confidential FROM knowledge_source_fragments "
            "WHERE source_id=$1 ORDER BY sort_order", source_id,
        )
        state = {
            r["owner_id"]: r["content_hash"]
            for r in await conn.fetch(
                "SELECT owner_id, content_hash FROM knowledge_generation_state "
                "WHERE owner_type='fragment' AND generator=$1", GENERATOR,
            )
        }

        todo = []
        skipped_done = skipped_frontmatter = 0
        for r in rows:
            frag = dict(r)
            fhash = _hash(f"{frag['title']}\n{frag['text']}")
            frag["_hash"] = fhash
            if state.get(frag["id"]) == fhash:
                skipped_done += 1
                continue
            if _is_skippable(frag["title"], frag["text"]):
                # Record state so we don't re-check it every run, but generate nothing.
                await conn.execute(
                    "INSERT INTO knowledge_generation_state (owner_type, owner_id, generator, content_hash, model_name) "
                    "VALUES ('fragment',$1,$2,$3,$4) ON CONFLICT (owner_type, owner_id, generator) "
                    "DO UPDATE SET content_hash=EXCLUDED.content_hash, updated_at=now()",
                    frag["id"], GENERATOR, fhash, model,
                )
                skipped_frontmatter += 1
                continue
            todo.append(frag)

        if limit:
            todo = todo[:limit]
        print(f"fragments: total={len(rows)} to_generate={len(todo)} "
              f"skipped_unchanged={skipped_done} skipped_frontmatter={skipped_frontmatter}")

        total_cards = 0
        gen_tokens = 0
        for i in range(0, len(todo), CONCURRENCY):
            batch = todo[i:i + CONCURRENCY]
            parsed_list = await asyncio.gather(
                *[asyncio.to_thread(_generate_for_fragment, model, f) for f in batch]
            )
            for frag, (parsed, tok) in zip(batch, parsed_list):
                gen_tokens += tok
                if parsed is None:
                    continue  # failed parse → leave for retry next run
                total_cards += await _write_fragment_cards(conn, frag, parsed, model, frag["_hash"])
            print(f"  processed {min(i + CONCURRENCY, len(todo))}/{len(todo)} fragments, cards so far={total_cards}")

        gen_tokens += await _gen_doc_summary(conn, source_id, source_key, model)

        by_type = await conn.fetch(
            "SELECT card_type, count(*) AS n FROM knowledge_cards WHERE source_id=$1 GROUP BY card_type ORDER BY card_type",
            source_id,
        )
        print(f"[done] source={source_key} new_cards_this_run={total_cards} tokens={gen_tokens}")
        for r in by_type:
            print(f"   {r['card_type']}: {r['n']} total")
        return {"cards": total_cards, "tokens": gen_tokens,
                "to_generate": len(todo), "skipped_unchanged": skipped_done}
    finally:
        await conn.close()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", required=True)
    ap.add_argument("--model", default=DEFAULT_MODEL)
    ap.add_argument("--limit", type=int, default=None, help="cap fragments (for cheap testing)")
    args = ap.parse_args()
    asyncio.run(run(args.source, args.model, args.limit))


if __name__ == "__main__":
    main()
