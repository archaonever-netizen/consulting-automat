"""Build / refresh embeddings for the knowledge base (the "smart search" index).

Computes 1536-dim embeddings (text-embedding-3-large via AITunnel) for source
fragments and generated cards, and stores them in `knowledge_embeddings`.

Economical + idempotent:
  - A content hash (model|dim|text) is stored per row. On re-run, rows whose
    text is unchanged are skipped — no re-embedding, no wasted spend.
  - Re-running after editing one source only re-embeds that source's changed rows.

Postgres only (pgvector). The DB comes from DATABASE_URL — point it at Supabase.

    python scripts/build_embeddings.py [--owner fragment|card|all] [--source KEY] [--batch 64]
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from hashlib import sha256
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.core.config import get_settings  # noqa: E402
from backend.services.embeddings_client import embed_texts_with_usage  # noqa: E402

# Embedding-input char cap (~6k tokens) so very long fragments never exceed the
# model limit. The stored source text itself is never truncated.
MAX_INPUT_CHARS = 24000


def _pg_dsn() -> str:
    raw = get_settings().database_url
    if raw.startswith("sqlite"):
        raise SystemExit(
            "Embeddings require Postgres/Supabase. Set DATABASE_URL to the Supabase URL."
        )
    return raw.replace("postgresql+asyncpg://", "postgresql://").replace(
        "postgres+asyncpg://", "postgres://"
    )


def _content_hash(model: str, dim: int, text: str) -> str:
    return sha256(f"{model}|{dim}|{text}".encode("utf-8")).hexdigest()


def _vec_literal(vec: list[float]) -> str:
    return "[" + ",".join(repr(float(x)) for x in vec) + "]"


async def _load_rows(conn, owner_type: str, source_key: str | None) -> list[dict]:
    if owner_type == "fragment":
        sql = (
            "SELECT f.id, f.title, f.full_text AS body, f.confidential "
            "FROM knowledge_source_fragments f "
            "JOIN knowledge_sources s ON s.id = f.source_id"
        )
        params = []
        if source_key:
            sql += " WHERE s.key = $1"
            params.append(source_key)
        sql += " ORDER BY f.id"
        rows = await conn.fetch(sql, *params)
    else:  # card
        sql = (
            "SELECT c.id, c.title, c.body, c.confidential "
            "FROM knowledge_cards c JOIN knowledge_sources s ON s.id = c.source_id"
        )
        params = []
        if source_key:
            sql += " WHERE s.key = $1"
            params.append(source_key)
        sql += " ORDER BY c.id"
        rows = await conn.fetch(sql, *params)
    return [dict(r) for r in rows]


async def _index_owner(conn, owner_type: str, source_key: str | None, batch: int) -> dict:
    settings = get_settings()
    model, dim = settings.embeddings_model, settings.embeddings_dim

    rows = await _load_rows(conn, owner_type, source_key)
    if not rows:
        return {"owner": owner_type, "total": 0, "embedded": 0, "skipped": 0}

    existing = {
        r["owner_id"]: r["content_hash"]
        for r in await conn.fetch(
            "SELECT owner_id, content_hash FROM knowledge_embeddings "
            "WHERE owner_type = $1 AND model_name = $2",
            owner_type, model,
        )
    }

    todo = []
    for r in rows:
        text = f"{r['title']}\n\n{r['body']}".strip()[:MAX_INPUT_CHARS]
        h = _content_hash(model, dim, text)
        if existing.get(r["id"]) == h:
            continue  # unchanged → skip (no re-embedding)
        todo.append({"id": r["id"], "text": text, "hash": h, "confidential": r["confidential"]})

    embedded = 0
    tokens = 0
    for i in range(0, len(todo), batch):
        chunk = todo[i:i + batch]
        vectors, tok = await asyncio.to_thread(embed_texts_with_usage, [c["text"] for c in chunk])
        tokens += tok
        async with conn.transaction():
            for c, vec in zip(chunk, vectors):
                await conn.execute(
                    "INSERT INTO knowledge_embeddings "
                    "(owner_type, owner_id, model_name, dim, embedding, content_hash, confidential) "
                    "VALUES ($1,$2,$3,$4,$5::vector,$6,$7) "
                    "ON CONFLICT (owner_type, owner_id, model_name) DO UPDATE SET "
                    "embedding = EXCLUDED.embedding, dim = EXCLUDED.dim, "
                    "content_hash = EXCLUDED.content_hash, confidential = EXCLUDED.confidential, "
                    "updated_at = now()",
                    owner_type, c["id"], model, dim, _vec_literal(vec), c["hash"], c["confidential"],
                )
        embedded += len(chunk)
        print(f"  [{owner_type}] embedded {embedded}/{len(todo)}")

    return {"owner": owner_type, "total": len(rows), "embedded": embedded,
            "skipped": len(rows) - embedded, "tokens": tokens}


async def run(owners: list[str], source_key: str | None, batch: int) -> list[dict]:
    import asyncpg
    conn = await asyncpg.connect(_pg_dsn(), timeout=30, statement_cache_size=0)
    results = []
    try:
        for owner_type in owners:
            result = await _index_owner(conn, owner_type, source_key, batch)
            results.append(result)
            print(
                f"[done] {result['owner']}: total={result['total']} "
                f"embedded={result['embedded']} skipped(unchanged)={result['skipped']} "
                f"tokens={result['tokens']}"
            )
    finally:
        await conn.close()
    return results


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--owner", choices=["fragment", "card", "all"], default="all")
    ap.add_argument("--source", default=None, help="limit to one source key")
    ap.add_argument("--batch", type=int, default=64)
    args = ap.parse_args()
    owners = ["fragment", "card"] if args.owner == "all" else [args.owner]
    asyncio.run(run(owners, args.source, args.batch))


if __name__ == "__main__":
    main()
