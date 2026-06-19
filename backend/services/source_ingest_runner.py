"""Background orchestrator for the «Add methodology» pipeline.

Runs the existing, unchanged scripts in order, updating the ingest_jobs row
(stage / progress / tokens) as it goes:

    extract → ingest (stay 'processing') → embed fragments → generate layers
    → embed cards → flip 'processed' → attach to cluster (framework)

Failure policy (all-or-nothing via visibility): on any error the source stays
'processing' and is therefore invisible to search/bots, while the PDF and the
job row are KEPT so the founder can retry. A retry resumes via the scripts'
idempotency (content hashes / generation state) and does not recompute finished
work. Partial data never leaks into search because only 'processed' is visible.
"""
from __future__ import annotations

import asyncio
import json
import sys
import traceback
from pathlib import Path

from sqlalchemy import text

from ..core.database import AsyncSessionLocal
from ..models import IngestJob, KnowledgeSource
from . import storage_client
from .bots import _ensure_framework
from .knowledge_ingest import ingest_source

ROOT = Path(__file__).resolve().parents[2]
KNOWLEDGE_DIR = ROOT / "knowledge"
_SCRIPTS = ROOT / "scripts"
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

LAYERS_MODEL = "google/gemini-3.1-flash-lite"


async def _update(job_id: int, **fields) -> None:
    async with AsyncSessionLocal() as db:
        job = await db.get(IngestJob, job_id)
        for k, v in fields.items():
            setattr(job, k, v)
        await db.commit()


async def _add_tokens(job_id: int, *, emb: int = 0, gen: int = 0) -> None:
    """Accumulate spend on the job (cumulative across retries — failed attempts
    count too, since they really cost money)."""
    async with AsyncSessionLocal() as db:
        job = await db.get(IngestJob, job_id)
        job.tokens_embeddings = (job.tokens_embeddings or 0) + emb
        job.tokens_generation = (job.tokens_generation or 0) + gen
        await db.commit()


async def run_ingest_job(job_id: int, *, _fail_after: str | None = None) -> dict:
    """Execute one ingest job. Returns a summary dict (also reflected on the row)."""
    async with AsyncSessionLocal() as db:
        job = await db.get(IngestJob, job_id)
        if job is None:
            return {"status": "error", "error": "job not found"}
        key = job.source_key
        manifest = {
            "key": key,
            "title": job.title or key,
            "source_type": "methodology_framework",
            "methodology": job.methodology,
            "language": job.language or "en",
            "confidential": bool(job.confidential),
            "pdf_file": f"{key}.pdf",
        }
        storage_path = job.storage_path
        framework_key = job.framework_key
        framework_name = job.framework_name or job.framework_key

    summary: dict = {"key": key, "tokens_embeddings": 0, "tokens_generation": 0, "stages": {}}
    try:
        # ── 1. extract ───────────────────────────────────────────────────────
        await _update(job_id, status="running", stage="extract",
                      progress="Извлечение текста и таблиц из PDF", error=None)
        src_dir = KNOWLEDGE_DIR / key
        src_dir.mkdir(parents=True, exist_ok=True)
        pdf_bytes = await asyncio.to_thread(storage_client.download, storage_path)
        (src_dir / f"{key}.pdf").write_bytes(pdf_bytes)
        (src_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")

        from build_source_artifacts import build  # pdfplumber import deferred to here
        art = await asyncio.to_thread(build, key)
        summary["stages"]["extract"] = {"pages": art["pages"], "fragments": art["fragments"]}

        # ── 2. ingest (stay 'processing' → invisible) ────────────────────────
        await _update(job_id, stage="ingest", progress="Запись в базу")
        async with AsyncSessionLocal() as db:
            ing = await ingest_source(db, key, mark_processed=False)
        summary["stages"]["ingest"] = ing

        # ── 3. embed fragments ───────────────────────────────────────────────
        await _update(job_id, stage="embed_fragments", progress="Умный поиск: эмбеддинги фрагментов")
        from build_embeddings import run as embed_run
        frag_res = (await embed_run(["fragment"], key, 64))[0]
        summary["stages"]["embed_fragments"] = frag_res
        await _add_tokens(job_id, emb=frag_res["tokens"])
        if _fail_after == "embed_fragments":
            raise RuntimeError("искусственный сбой после эмбеддингов фрагментов (тест)")

        # ── 4. generate layers (Russian cards) ───────────────────────────────
        await _update(job_id, stage="layers", progress="Генерация карточек на русском")
        from build_layers import run as layers_run

        async def _layers_heartbeat(done: int, total: int, cards: int) -> None:
            # Живой прогресс по ходу генерации: бампит updated_at, иначе на больших
            # PDF этот этап молчит дольше порога «зависла» во фронте.
            await _update(job_id, progress=f"Генерация карточек: {done}/{total} фрагментов ({cards} карточек)")

        lay_res = await layers_run(key, LAYERS_MODEL, None, on_progress=_layers_heartbeat)
        summary["stages"]["layers"] = lay_res
        await _add_tokens(job_id, gen=(lay_res or {}).get("tokens", 0))
        if _fail_after == "layers":
            raise RuntimeError("искусственный сбой после генерации слоёв (тест)")

        # ── 5. embed cards ───────────────────────────────────────────────────
        await _update(job_id, stage="embed_cards", progress="Умный поиск: эмбеддинги карточек")
        card_res = (await embed_run(["card"], key, 64))[0]
        summary["stages"]["embed_cards"] = card_res
        await _add_tokens(job_id, emb=card_res["tokens"])

        # ── 6. attach: flip 'processed' + link to cluster (framework) ────────
        await _update(job_id, stage="attach", progress="Привязка к кластеру")
        async with AsyncSessionLocal() as db:
            await db.execute(
                text("UPDATE knowledge_sources SET processing_status='processed', "
                     "processed_at=now() WHERE key=:k"), {"k": key})
            await db.commit()
        if framework_key:
            async with AsyncSessionLocal() as db:
                await _ensure_framework(
                    db, key=framework_key, name=framework_name or framework_key,
                    description=f"Кластер «{framework_name or framework_key}»",
                    source_keys=[key])
                await db.commit()

        # ── done ─────────────────────────────────────────────────────────────
        await _update(job_id, status="done", stage="finished", progress="Готово")
        async with AsyncSessionLocal() as db:
            j = await db.get(IngestJob, job_id)
            summary.update({"status": "done",
                            "tokens_embeddings": j.tokens_embeddings,
                            "tokens_generation": j.tokens_generation})
        return summary

    except Exception as exc:  # noqa: BLE001
        # Keep PDF + job + partial (invisible) data for a resume; do NOT clean up.
        # Tokens already accumulated per step, so the failed spend stays counted.
        # Store the FULL traceback (error is TEXT) and flush it to stdout so the
        # real cause survives in the log — never lose it to truncation again.
        tb = traceback.format_exc()
        print(tb, flush=True)
        await _update(job_id, status="failed", error=tb)
        async with AsyncSessionLocal() as db:
            j = await db.get(IngestJob, job_id)
            summary.update({"status": "failed", "error": str(exc),
                            "tokens_embeddings": j.tokens_embeddings,
                            "tokens_generation": j.tokens_generation})
        return summary
