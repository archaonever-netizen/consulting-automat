"""Admin logic for the «Add methodology» screen (founder-only).

Thin service layer the API routes call: cost estimate, create a draft job
(PDF → Storage), start a job (queue-of-one guard), job status, sample cards.
The heavy pipeline lives in source_ingest_runner.run_ingest_job.
"""
from __future__ import annotations

import re
from io import BytesIO

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import IngestJob, KnowledgeCard, KnowledgeSource
from . import storage_client

# Calibrated from the Step-3 real run (≈5800 tokens for a 3-page PDF ≈ 1900/page;
# ~1100 of it generation, ~800 embeddings). Cost is approximate — we don't have
# the provider's exact ruble tariff, so RUB_PER_1K is a rough, adjustable figure.
EST_TOKENS_PER_PAGE = 1900
RUB_PER_1K_TOKENS = 0.10


def _slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", (s or "").lower()).strip("_")[:60]


def estimate(pages: int) -> dict:
    tokens = pages * EST_TOKENS_PER_PAGE
    return {
        "pages": pages,
        "est_tokens": tokens,
        "est_cost_rub": round(tokens / 1000 * RUB_PER_1K_TOKENS, 2),
        "approx": True,  # «≈» — show as approximate
    }


def cost_from_tokens(tokens: int) -> float:
    return round((tokens or 0) / 1000 * RUB_PER_1K_TOKENS, 2)


async def create_job(
    db: AsyncSession, *, key: str, file_bytes: bytes, title: str, methodology: str | None,
    language: str, confidential: bool, framework_key: str | None, framework_name: str | None,
    created_by_id: int | None,
) -> dict:
    key = _slug(key) or _slug(methodology or "") or _slug(title) or "source"
    # Creating a new cluster: derive a stable framework key from its name; fall
    # back to the source key if the name has no latin chars (e.g. Cyrillic).
    if not framework_key and framework_name:
        framework_key = _slug(framework_name) or f"fw_{key}"

    existing = await db.scalar(select(KnowledgeSource).where(KnowledgeSource.key == key))
    if existing is not None and existing.processing_status == "processed":
        raise ValueError(f"Источник с ключом «{key}» уже существует. Выберите другой ключ.")

    try:
        pages = len(__import__("pypdf").PdfReader(BytesIO(file_bytes)).pages)
    except Exception:
        raise ValueError("Не удалось прочитать PDF — файл повреждён или это не PDF.")
    if pages == 0:
        raise ValueError("В PDF нет страниц.")

    est = estimate(pages)
    storage_path = f"sources/{key}/{key}.pdf"
    storage_client.ensure_bucket()
    await __import__("asyncio").to_thread(storage_client.upload, storage_path, file_bytes)

    job = IngestJob(
        source_key=key, title=title, methodology=methodology, language=language,
        confidential=confidential, storage_path=storage_path,
        framework_key=framework_key, framework_name=framework_name,
        status="draft", est_pages=pages, est_cost_rub=est["est_cost_rub"],
        created_by_id=created_by_id,
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)
    return {"job_id": job.id, "key": key, **est}


async def start_job(db: AsyncSession, job_id: int) -> dict:
    """Mark the job queued. Queue-of-one: refuse if another import is active.

    The actual background run is kicked off by the route (asyncio task); this
    service only does the guard + state change so it stays easy to test.
    """
    job = await db.get(IngestJob, job_id)
    if job is None:
        raise ValueError("Задача не найдена.")
    active = await db.scalar(
        select(func.count()).select_from(IngestJob)
        .where(IngestJob.status.in_(("queued", "running")), IngestJob.id != job_id)
    )
    if active:
        raise ValueError("Уже идёт импорт другого документа. Дождитесь его завершения.")
    job.status = "queued"
    job.error = None
    await db.commit()
    return {"job_id": job.id, "status": "queued"}


async def job_status(db: AsyncSession, job_id: int) -> dict | None:
    job = await db.get(IngestJob, job_id)
    if job is None:
        return None
    spent = (job.tokens_embeddings or 0) + (job.tokens_generation or 0)
    return {
        "job_id": job.id, "key": job.source_key, "status": job.status, "stage": job.stage,
        "progress": job.progress, "error": job.error,
        "est_pages": job.est_pages, "est_cost_rub": job.est_cost_rub,
        "tokens_embeddings": job.tokens_embeddings, "tokens_generation": job.tokens_generation,
        "tokens_total": spent, "actual_cost_rub": cost_from_tokens(spent), "approx": True,
        "framework_key": job.framework_key, "framework_name": job.framework_name,
        "updated_at": job.updated_at.isoformat() if job.updated_at else None,
        "created_at": job.created_at.isoformat() if job.created_at else None,
    }


async def cancel_job(db: AsyncSession, job_id: int) -> dict:
    """Cancel/abandon an import: remove all its DB data + the stored PDF, mark
    the job cancelled. Used for a stuck or unwanted import."""
    import asyncio as _asyncio

    from .knowledge_ingest import cleanup_source
    job = await db.get(IngestJob, job_id)
    if job is None:
        raise ValueError("Задача не найдена.")
    await cleanup_source(db, job.source_key)
    if job.storage_path:
        try:
            await _asyncio.to_thread(storage_client.delete, job.storage_path)
        except Exception:
            pass
    job = await db.get(IngestJob, job_id)
    job.status = "cancelled"
    job.stage = None
    job.progress = "Отменено"
    await db.commit()
    return {"job_id": job_id, "status": "cancelled"}


async def sample_cards(db: AsyncSession, key: str, *, n: int = 3) -> list[dict]:
    """A few generated cards (method cards + typical errors) for the success panel."""
    source = await db.scalar(select(KnowledgeSource).where(KnowledgeSource.key == key))
    if source is None:
        return []
    out: list[dict] = []
    for card_type in ("method_card", "typical_error"):
        rows = (await db.scalars(
            select(KnowledgeCard)
            .where(KnowledgeCard.source_id == source.id, KnowledgeCard.card_type == card_type)
            .order_by(func.length(KnowledgeCard.body).desc())
            .limit(n)
        )).all()
        for c in rows:
            out.append({
                "card_type": c.card_type, "title": c.title, "body": c.body,
                "page_start": c.page_start, "page_end": c.page_end,
            })
    return out
