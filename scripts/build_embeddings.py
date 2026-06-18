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
import socket
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


async def _connect():
    """Open a fresh asyncpg connection with TCP keepalive enabled."""
    import asyncpg
    conn = await asyncpg.connect(_pg_dsn(), timeout=30, statement_cache_size=0)
    _enable_keepalive(conn)
    return conn


def _enable_keepalive(conn) -> None:
    """Best-effort TCP keepalive: long batch jobs hold the connection while slow
    embedding/LLM calls run, and an idle socket can be silently dropped by the
    pooler/NAT. Keepalive probes keep it alive (and surface a real drop fast).
    Touches private transport internals, so everything is guarded."""
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

    Safe because every write here is idempotent (ON CONFLICT upserts), so
    replaying a batch never duplicates or corrupts. Returns (live_conn, result)
    — the connection may be a new object."""
    import asyncpg
    drop_errs = (asyncpg.InterfaceError, asyncpg.ConnectionDoesNotExistError, OSError)
    if conn is None or conn.is_closed():
        conn = await _connect()
    try:
        return conn, await op(conn)
    except drop_errs as e:  # noqa: BLE001
        print(f"  ⚠ соединение к БД потеряно ({type(e).__name__}: {str(e)[:80]}); "
              "переподключаюсь и повторяю пачку…")
        try:
            await conn.close()
        except Exception:  # noqa: BLE001
            pass
        conn = await _connect()
        return conn, await op(conn)


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

        # Reconnect-safe write: the embedding call above can take long enough for
        # an idle DB connection to be dropped; reconnect + retry before/around the
        # write. Idempotent upsert makes the retry safe.
        async def _write(cx, chunk=chunk, vectors=vectors):
            async with cx.transaction():
                for item, vec in zip(chunk, vectors):
                    await cx.execute(
                        "INSERT INTO knowledge_embeddings "
                        "(owner_type, owner_id, model_name, dim, embedding, content_hash, confidential) "
                        "VALUES ($1,$2,$3,$4,$5::vector,$6,$7) "
                        "ON CONFLICT (owner_type, owner_id, model_name) DO UPDATE SET "
                        "embedding = EXCLUDED.embedding, dim = EXCLUDED.dim, "
                        "content_hash = EXCLUDED.content_hash, confidential = EXCLUDED.confidential, "
                        "updated_at = now()",
                        owner_type, item["id"], model, dim, _vec_literal(vec), item["hash"], item["confidential"],
                    )

        conn, _ = await _exec_with_reconnect(conn, _write)
        embedded += len(chunk)
        print(f"  [{owner_type}] embedded {embedded}/{len(todo)}")

    return conn, {"owner": owner_type, "total": len(rows), "embedded": embedded,
                  "skipped": len(rows) - embedded, "tokens": tokens}


async def run(owners: list[str], source_key: str | None, batch: int) -> list[dict]:
    conn = await _connect()
    results = []
    try:
        for owner_type in owners:
            conn, result = await _index_owner(conn, owner_type, source_key, batch)
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
