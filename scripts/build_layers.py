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
import socket
import sys
from hashlib import sha256
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
_SCRIPTS = Path(__file__).resolve().parent
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

from backend.core.config import get_settings  # noqa: E402
from build_source_artifacts import sanitize_text  # noqa: E402 — общий санитайзер текста перед записью в БД

GENERATOR = "cards_v1"
DEFAULT_MODEL = "google/gemini-3.1-flash-lite"
CONCURRENCY = 4
MIN_TEXT_CHARS = 200
MAX_INPUT_CHARS = 12000
MAX_JSON_RETRIES = 2  # повторы генерации при невалидном JSON (всего попыток = +1)
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


async def _connect():
    """Open a fresh asyncpg connection with TCP keepalive enabled."""
    import asyncpg
    conn = await asyncpg.connect(_pg_dsn(), timeout=30, statement_cache_size=0)
    _enable_keepalive(conn)
    return conn


def _enable_keepalive(conn) -> None:
    """Best-effort TCP keepalive: long batch jobs hold the connection while slow
    LLM calls run, and an idle socket can be silently dropped by the pooler/NAT.
    Keepalive probes keep it alive (and surface a real drop fast). Touches private
    transport internals, so everything is guarded."""
    try:
        sock = conn._transport.get_extra_info("socket")  # noqa: SLF001
    except Exception:  # noqa: BLE001
        sock = None
    if sock is None:
        return
    try:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_KEEPALIVE, 1)
        if hasattr(socket, "TCP_KEEPIDLE"):  # Linux
            sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_KEEPIDLE, 30)
            sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_KEEPINTVL, 10)
            sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_KEEPCNT, 3)
        elif hasattr(socket, "SIO_KEEPALIVE_VALS"):  # Windows
            sock.ioctl(socket.SIO_KEEPALIVE_VALS, (1, 30000, 10000))  # on, idle ms, interval ms
    except OSError:
        pass


async def _exec_with_reconnect(conn, op):
    """Run `await op(conn)`; if the connection was dropped (idle-timeout / pooler
    recycle / network blip), reconnect once and retry the whole op.

    Safe because every write here is idempotent (delete+reinsert per fragment /
    ON CONFLICT upserts), so replaying never duplicates or corrupts. Returns
    (live_conn, result) — the connection may be a new object."""
    import asyncpg
    drop_errs = (asyncpg.InterfaceError, asyncpg.ConnectionDoesNotExistError, OSError)
    if conn is None or conn.is_closed():
        conn = await _connect()
    try:
        return conn, await op(conn)
    except drop_errs as e:  # noqa: BLE001
        print(f"  ⚠ соединение к БД потеряно ({type(e).__name__}: {str(e)[:80]}); "
              "переподключаюсь и повторяю…")
        try:
            await conn.close()
        except Exception:  # noqa: BLE001
            pass
        conn = await _connect()
        return conn, await op(conn)


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
    base_user = (
        f"Раздел: {frag['title']}\n"
        f"Страница: {frag['page_start']}–{frag['page_end']}\n\n"
        f"Текст фрагмента:\n{frag['text'][:MAX_INPUT_CHARS]}"
    )
    tokens_total = 0
    # Self-heal a single malformed reply: retry on invalid JSON with a stricter
    # «верни только JSON» reminder. Spend of retries is counted. Non-JSON errors
    # (network etc.) are not retried here — they're left for the next run.
    for attempt in range(1, MAX_JSON_RETRIES + 2):
        user = base_user if attempt == 1 else (
            base_user
            + "\n\nВАЖНО: верни ТОЛЬКО валидный JSON по схеме из инструкции — без пояснений, "
              "без markdown-ограждений, с корректными запятыми и кавычками."
        )
        try:
            raw, tokens = _chat(model, SYSTEM_PROMPT, user)
            tokens_total += tokens
            return _extract_json(raw), tokens_total
        except json.JSONDecodeError as e:
            print(f"  ! fragment {frag['id']} невалидный JSON "
                  f"(попытка {attempt}/{MAX_JSON_RETRIES + 1}): {str(e)[:80]}")
            continue
        except Exception as e:  # noqa: BLE001 — сетевые/прочие сбои не ретраим здесь
            print(f"  ! fragment {frag['id']} failed: {type(e).__name__}: {str(e)[:120]}")
            return None, tokens_total
    print(f"  ! fragment {frag['id']} пропущен после {MAX_JSON_RETRIES + 1} попыток (невалидный JSON)")
    return None, tokens_total


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
                title = sanitize_text((item.get("title") or "").strip())
                body = sanitize_text((item.get("body") or "").strip())
                if not title or not body:
                    continue
                # maturity_level — колонка varchar(40); модель иногда возвращает
                # длинную фразу вместо короткого уровня, поэтому подрезаем под ширину.
                maturity_level = sanitize_text((item.get("maturity_level") or "").strip())[:40] or None
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
                    frag["methodology"], maturity_level,
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


async def _gen_doc_summary(conn, source_id: int, source_key: str, model: str):
    """Returns (live_conn, tokens). Reconnect-safe: the LLM call in the middle can
    outlast an idle DB connection."""
    conn, exists = await _exec_with_reconnect(
        conn, lambda c: c.fetchval(
            "SELECT 1 FROM knowledge_source_layers WHERE source_id=$1 AND layer_type='description_ru'",
            source_id))
    if exists:
        print("  doc summary (ru): already exists, skipped")
        return conn, 0
    conn, titles = await _exec_with_reconnect(
        conn, lambda c: c.fetch(
            "SELECT title FROM knowledge_source_fragments WHERE source_id=$1 ORDER BY sort_order LIMIT 60",
            source_id))
    outline = "\n".join(f"- {r['title']}" for r in titles)
    user = (
        f"Документ: {source_key}. Ниже оглавление (английское). Напиши КРАТКОЕ описание "
        f"документа НА РУССКОМ (3–5 предложений): о чём он, для чего применяется, кому полезен. "
        f"Только по оглавлению, без выдумок.\n\nОглавление:\n{outline}"
    )
    try:
        text, doc_tokens = await asyncio.to_thread(
            _chat, model, "Ты — методолог. Пиши деловой русский.", user, 500)
        text = sanitize_text(text.strip())
        if text:
            conn, _ = await _exec_with_reconnect(
                conn, lambda c, t=text: c.execute(
                    "INSERT INTO knowledge_source_layers "
                    "(source_id, layer_type, title, content, content_origin, sort_order, created_at) "
                    "VALUES ($1,'description_ru','Краткое описание (RU)',$2,'ai_generated',5, now())",
                    source_id, t))
            print("  doc summary (ru): created")
        return conn, doc_tokens
    except Exception as e:  # noqa: BLE001
        print(f"  doc summary failed: {type(e).__name__}: {str(e)[:120]}")
        return conn, 0


async def run(source_key: str, model: str, limit: int | None) -> None:
    conn = await _connect()
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
                # The LLM batch above can outlast an idle DB connection; reconnect
                # + retry around the write. delete+reinsert per fragment is idempotent.
                conn, written = await _exec_with_reconnect(
                    conn, lambda c, f=frag, p=parsed: _write_fragment_cards(c, f, p, model, f["_hash"]))
                total_cards += written
            print(f"  processed {min(i + CONCURRENCY, len(todo))}/{len(todo)} fragments, cards so far={total_cards}")

        conn, doc_tokens = await _gen_doc_summary(conn, source_id, source_key, model)
        gen_tokens += doc_tokens

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
