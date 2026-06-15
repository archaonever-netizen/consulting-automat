"""Hybrid knowledge search for the Methodolog.

Combines, in one query:
  - semantic search (pgvector cosine over 1536-dim embeddings) — finds meaning,
    so a Russian query matches English source fragments;
  - keyword search (Postgres full-text `simple` + trigram) — finds exact terms;
fused with Reciprocal Rank Fusion (RRF), then near-duplicate results are collapsed
so the answer is not repetitive. Filters by methodology and content type/card type.

Postgres + pgvector only. Uses its own asyncpg connection (the embeddings live in
pgvector, which the app's SQLite dev DB does not have). DB from DATABASE_URL.
"""
from __future__ import annotations

import asyncio
import difflib
from dataclasses import dataclass, field

from ..core.config import get_settings
from .embeddings_client import embed_text

RRF_K = 60                 # RRF damping constant (standard ~60)
CANDIDATE_K = 30           # candidates pulled from each retriever before fusion
DEDUP_RATIO = 0.86         # SequenceMatcher ratio above which results are "twins"


@dataclass
class SearchHit:
    owner_type: str        # 'card' | 'fragment'
    id: int
    title: str
    text: str
    card_type: str | None
    methodology: str | None
    page_start: int | None
    page_end: int | None
    source_ref: str | None
    source_key: str | None
    section: str | None = None   # document section (fragment title) for citations
    vscore: float | None = None
    kscore: float | None = None
    rrf: float = 0.0
    retrievers: set = field(default_factory=set)


def _pg_dsn() -> str:
    raw = get_settings().database_url
    if raw.startswith("sqlite"):
        raise RuntimeError("Hybrid search requires Postgres/Supabase (pgvector).")
    return raw.replace("postgresql+asyncpg://", "postgresql://").replace(
        "postgres+asyncpg://", "postgres://"
    )


def _vec_literal(vec: list[float]) -> str:
    return "[" + ",".join(repr(float(x)) for x in vec) + "]"


def _hit_from_card(r, *, vscore=None, kscore=None) -> SearchHit:
    return SearchHit(
        owner_type="card", id=r["id"], title=r["title"], text=r["body"],
        card_type=r["card_type"], methodology=r["methodology"],
        page_start=r["page_start"], page_end=r["page_end"], source_ref=r["source_ref"],
        source_key=r["source_key"], section=r.get("section"), vscore=vscore, kscore=kscore,
    )


def _hit_from_fragment(r, *, vscore=None, kscore=None) -> SearchHit:
    return SearchHit(
        owner_type="fragment", id=r["id"], title=r["title"], text=r["full_text"],
        card_type=None, methodology=r["methodology"],
        page_start=r["page_start"], page_end=r["page_end"], source_ref=r["source_ref"],
        source_key=r["source_key"], section=r["title"], vscore=vscore, kscore=kscore,
    )


# ── Retrievers (cards) ─────────────────────────────────────────────────────
# `source_keys` фильтрует выдачу по набору источников (фреймворк = группа
# источников знаний). None — без фильтра; это переиспользует существующую
# колонку s.key, а не строит параллельную систему отбора.
async def _cards_vector(conn, qvec, methodology, card_type, source_keys, limit):
    rows = await conn.fetch(
        "SELECT c.id, c.title, c.body, c.card_type, c.methodology, c.page_start, c.page_end, "
        "       c.source_ref, s.key AS source_key, sf.title AS section, "
        "       1-(e.embedding <=> $1::vector) AS vscore "
        "FROM knowledge_embeddings e "
        "JOIN knowledge_cards c ON c.id=e.owner_id AND e.owner_type='card' "
        "JOIN knowledge_sources s ON s.id=c.source_id "
        "LEFT JOIN knowledge_source_fragments sf ON sf.id=c.supporting_fragment_id "
        "WHERE ($2::text IS NULL OR c.methodology=$2) "
        "  AND ($3::text IS NULL OR c.card_type=$3) "
        "  AND ($4::text[] IS NULL OR s.key = ANY($4)) "
        "  AND s.processing_status = 'processed' "
        "ORDER BY e.embedding <=> $1::vector LIMIT $5",
        qvec, methodology, card_type, source_keys, limit,
    )
    return [_hit_from_card(r, vscore=r["vscore"]) for r in rows]


async def _cards_keyword(conn, query, methodology, card_type, source_keys, limit):
    rows = await conn.fetch(
        "SELECT c.id, c.title, c.body, c.card_type, c.methodology, c.page_start, c.page_end, "
        "       c.source_ref, s.key AS source_key, sf.title AS section, "
        "       ts_rank(c.search_tsv, plainto_tsquery('simple',$1)) AS kscore "
        "FROM knowledge_cards c JOIN knowledge_sources s ON s.id=c.source_id "
        "LEFT JOIN knowledge_source_fragments sf ON sf.id=c.supporting_fragment_id "
        "WHERE c.search_tsv @@ plainto_tsquery('simple',$1) "
        "  AND ($2::text IS NULL OR c.methodology=$2) "
        "  AND ($3::text IS NULL OR c.card_type=$3) "
        "  AND ($4::text[] IS NULL OR s.key = ANY($4)) "
        "  AND s.processing_status = 'processed' "
        "ORDER BY kscore DESC LIMIT $5",
        query, methodology, card_type, source_keys, limit,
    )
    return [_hit_from_card(r, kscore=r["kscore"]) for r in rows]


# ── Retrievers (fragments) ─────────────────────────────────────────────────
async def _fragments_vector(conn, qvec, methodology, source_keys, limit):
    rows = await conn.fetch(
        "SELECT f.id, f.title, f.full_text, f.methodology, f.page_start, f.page_end, "
        "       f.source_ref, s.key AS source_key, 1-(e.embedding <=> $1::vector) AS vscore "
        "FROM knowledge_embeddings e "
        "JOIN knowledge_source_fragments f ON f.id=e.owner_id AND e.owner_type='fragment' "
        "JOIN knowledge_sources s ON s.id=f.source_id "
        "WHERE ($2::text IS NULL OR f.methodology=$2) "
        "  AND ($3::text[] IS NULL OR s.key = ANY($3)) "
        "  AND s.processing_status = 'processed' "
        "ORDER BY e.embedding <=> $1::vector LIMIT $4",
        qvec, methodology, source_keys, limit,
    )
    return [_hit_from_fragment(r, vscore=r["vscore"]) for r in rows]


async def _fragments_keyword(conn, query, methodology, source_keys, limit):
    rows = await conn.fetch(
        "SELECT f.id, f.title, f.full_text, f.methodology, f.page_start, f.page_end, "
        "       f.source_ref, s.key AS source_key, "
        "       ts_rank(f.search_tsv, plainto_tsquery('simple',$1)) AS kscore "
        "FROM knowledge_source_fragments f JOIN knowledge_sources s ON s.id=f.source_id "
        "WHERE f.search_tsv @@ plainto_tsquery('simple',$1) "
        "  AND ($2::text IS NULL OR f.methodology=$2) "
        "  AND ($3::text[] IS NULL OR s.key = ANY($3)) "
        "  AND s.processing_status = 'processed' "
        "ORDER BY kscore DESC LIMIT $4",
        query, methodology, source_keys, limit,
    )
    return [_hit_from_fragment(r, kscore=r["kscore"]) for r in rows]


# ── Fusion + dedup ─────────────────────────────────────────────────────────
def _rrf_fuse(rank_lists: list[list[SearchHit]]) -> list[SearchHit]:
    merged: dict[tuple, SearchHit] = {}
    for lst in rank_lists:
        for rank, hit in enumerate(lst):
            key = (hit.owner_type, hit.id)
            cur = merged.get(key)
            if cur is None:
                merged[key] = hit
                cur = hit
            else:
                # keep whichever sub-scores we have
                cur.vscore = cur.vscore if cur.vscore is not None else hit.vscore
                cur.kscore = cur.kscore if cur.kscore is not None else hit.kscore
            cur.rrf += 1.0 / (RRF_K + rank + 1)
            cur.retrievers.add(id(lst))
    return sorted(merged.values(), key=lambda h: h.rrf, reverse=True)


def _dedup(hits: list[SearchHit]) -> list[SearchHit]:
    kept: list[SearchHit] = []
    for h in hits:
        twin = False
        for k in kept:
            if h.owner_type == k.owner_type and h.card_type == k.card_type \
                    and h.page_start == k.page_start:
                if difflib.SequenceMatcher(None, h.text, k.text).ratio() > DEDUP_RATIO:
                    twin = True
                    break
        if not twin:
            kept.append(h)
    return kept


# ── Public API ─────────────────────────────────────────────────────────────
async def hybrid_search(
    conn,
    query: str,
    *,
    scope: str = "cards",          # 'cards' | 'fragments' | 'both'
    methodology: str | None = None,
    card_type: str | None = None,  # method_card | typical_error | diagnostic_question
    source_keys: list[str] | None = None,  # фильтр по источникам (фреймворк бота)
    limit: int = 10,
    candidate_k: int = CANDIDATE_K,
) -> list[SearchHit]:
    qvec = _vec_literal(await asyncio.to_thread(embed_text, query))
    # Пустой список источников трактуем как «без фильтра» (бот без фреймворков
    # ищет по всей базе), чтобы случайно не обнулить выдачу.
    keys = source_keys or None

    lists: list[list[SearchHit]] = []
    if scope in ("cards", "both"):
        lists.append(await _cards_vector(conn, qvec, methodology, card_type, keys, candidate_k))
        lists.append(await _cards_keyword(conn, query, methodology, card_type, keys, candidate_k))
    if scope in ("fragments", "both"):
        lists.append(await _fragments_vector(conn, qvec, methodology, keys, candidate_k))
        lists.append(await _fragments_keyword(conn, query, methodology, keys, candidate_k))

    fused = _rrf_fuse(lists)
    deduped = _dedup(fused)
    return deduped[:limit]


async def search(query: str, **kwargs) -> list[SearchHit]:
    """Open a connection from DATABASE_URL and run a hybrid search."""
    import asyncpg
    conn = await asyncpg.connect(_pg_dsn(), timeout=30, statement_cache_size=0)
    try:
        return await hybrid_search(conn, query, **kwargs)
    finally:
        await conn.close()
