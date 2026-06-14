"""Generic, idempotent loader for knowledge sources from committed artifacts.

Generalizes `seed_bpmm_source`: given a source key under `knowledge/<key>/`
with a `manifest.json` "passport" and the committed text artifacts
(`<key>.fulltext.txt`, `<key>.fragments.jsonl`), it upserts the source, its
verbatim text, and its fragments into the database.

Hard principles respected here:
  - The verbatim source text is stored unchanged as `source_original`.
  - Re-running does not create duplicates: a SHA-256 checksum of the artifacts
    is stored; an unchanged source is skipped. Only a changed source is
    re-imported (its own rows are replaced), never other sources' data.
  - `confidential` from the manifest is stored on the source and denormalized
    onto every fragment so the embedding builder / search can filter safely.
"""
from __future__ import annotations

import json
from datetime import datetime
from hashlib import sha256
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import (
    KnowledgeSource,
    KnowledgeSourceFragment,
    KnowledgeSourceText,
)
from .knowledge import _fragment_summary, _link_source, _upsert_section

ROOT = Path(__file__).resolve().parents[2]
KNOWLEDGE_DIR = ROOT / "knowledge"


def load_manifest(key: str) -> dict:
    manifest_path = KNOWLEDGE_DIR / key / "manifest.json"
    if not manifest_path.exists():
        raise FileNotFoundError(f"manifest not found: {manifest_path}")
    return json.loads(manifest_path.read_text(encoding="utf-8"))


async def ingest_source(db: AsyncSession, key: str) -> dict:
    """Load (or refresh) one knowledge source from its committed artifacts.

    Returns a small status dict: {"status": "unchanged"|"imported", ...}.
    """
    manifest = load_manifest(key)
    source_dir = KNOWLEDGE_DIR / key
    fulltext_path = source_dir / f"{key}.fulltext.txt"
    fragments_path = source_dir / f"{key}.fragments.jsonl"
    if not fulltext_path.exists() or not fragments_path.exists():
        raise FileNotFoundError(
            f"artifacts missing for '{key}'. Run scripts/build_source_artifacts.py {key} first."
        )

    confidential = bool(manifest.get("confidential", False))
    methodology = manifest.get("methodology")
    language = manifest.get("language", "en")
    version = manifest.get("version")

    checksum = sha256(fulltext_path.read_bytes() + fragments_path.read_bytes()).hexdigest()
    existing = await db.scalar(select(KnowledgeSource).where(KnowledgeSource.key == key))
    if (
        existing is not None
        and existing.checksum == checksum
        and existing.processing_status == "processed"
    ):
        await _ensure_sections(db, existing)
        await db.commit()
        return {"status": "unchanged", "key": key, "source_id": existing.id}

    # Changed (or new): replace only this source's own rows. Cascade removes its
    # texts/fragments/layers/links; other sources are untouched.
    if existing is not None:
        await db.delete(existing)
        await db.flush()

    source = KnowledgeSource(
        key=key,
        title=manifest.get("title", key),
        source_type=manifest.get("source_type", "methodology_framework"),
        version=version,
        language=language,
        source_file=str((source_dir / f"{key}.fulltext.txt").relative_to(ROOT)).replace("\\", "/"),
        source_url=manifest.get("source_url") or None,
        processing_status="processing",
        checksum=checksum,
        confidential=confidential,
        methodology=methodology,
        metadata_json={
            "manifest": manifest,
            "original_file": str((source_dir / manifest["pdf_file"]).relative_to(ROOT)).replace("\\", "/"),
            "import_note": "Runtime imports source_original text from committed artifacts, not from PDF parsing.",
        },
    )
    db.add(source)
    await db.flush()

    full_text = fulltext_path.read_text(encoding="utf-8")
    db.add(KnowledgeSourceText(
        source_id=source.id,
        text=full_text,
        text_origin="source_original",
        extraction_method=f"committed {key}.fulltext.txt generated from {manifest['pdf_file']} via pdfplumber",
    ))

    with fragments_path.open("r", encoding="utf-8") as fragments_file:
        fragments = [json.loads(line) for line in fragments_file if line.strip()]

    source_file = source.source_file
    for item in fragments:
        fragment_text = str(item["text"]).strip()
        if not fragment_text:
            continue
        title = str(item["title"]).strip()
        order = int(item["sort_order"])
        db.add(KnowledgeSourceFragment(
            source_id=source.id,
            title=title,
            full_text=fragment_text,
            summary=_fragment_summary(title, fragment_text),
            summary_origin="ai_generated",
            text_origin="source_original",
            sort_order=order,
            outline_level=int(item.get("outline_level", 0)),
            page_start=item.get("page_start"),
            page_end=item.get("page_end"),
            source_ref=f"{source_file}#fragment={order}",
            methodology=methodology,
            lang=language,
            source_version=version,
            confidential=confidential,
            metadata_json={
                "sub_index": int(item.get("sub_index", 0)),
                "fragmenting_basis": "PDF outline sections, large sections split into page-aligned sub-chunks",
                "original_source_ref": f"{manifest['pdf_file']}#page={item.get('page_start')}",
            },
        ))

    source.processing_status = "processed"
    source.processed_at = datetime.utcnow()
    await _ensure_sections(db, source)
    await db.commit()
    return {
        "status": "imported",
        "key": key,
        "source_id": source.id,
        "fragments": len(fragments),
        "confidential": confidential,
    }


async def _ensure_sections(db: AsyncSession, source: KnowledgeSource) -> None:
    """Place the source in the knowledge UI tree (idempotent, stable keys)."""
    root = await _upsert_section(
        db,
        key="methodologies-frameworks",
        title="Методологии и фреймворки",
        description="Каталог методологий, стандартов и фреймворков для ИИ-ассистентов.",
        parent=None,
        section_type="category",
        sort_order=10,
    )
    process_methodologies = await _upsert_section(
        db,
        key="process-methodologies",
        title="Методологии процессов",
        description="Методологии и модели, связанные с управлением и зрелостью процессов.",
        parent=root,
        section_type="subcategory",
        sort_order=10,
    )
    sources = await _upsert_section(
        db,
        key="process-methodology-sources",
        title="Источники",
        description="Загруженные первоисточники для методологий процессов.",
        parent=process_methodologies,
        section_type="sources",
        sort_order=10,
    )
    await db.flush()
    await _link_source(db, source, sources, "listed_under", 10)
