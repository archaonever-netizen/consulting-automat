"""One-command ingestion of a single knowledge source.

    python scripts/ingest_source.py <key> [--skip-build]

Steps:
  1. Build committed artifacts from the PDF (text + tables, page-anchored
     chunks) — unless --skip-build is given.
  2. Idempotently load the source into the database (no duplicates on re-run).

The target database is taken from DATABASE_URL (see backend config). Point it at
Supabase to load into the production knowledge base.
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


async def _load(key: str) -> dict:
    # Imported here so --skip-build path and DB load don't require pdfplumber.
    from backend.core.database import AsyncSessionLocal, engine
    from backend.services.knowledge_ingest import ingest_source

    async with AsyncSessionLocal() as db:
        result = await ingest_source(db, key)
    await engine.dispose()
    return result


def main() -> None:
    args = [a for a in sys.argv[1:] if a]
    skip_build = "--skip-build" in args
    keys = [a for a in args if not a.startswith("--")]
    if len(keys) != 1:
        raise SystemExit("usage: python scripts/ingest_source.py <key> [--skip-build]")
    key = keys[0]

    if not skip_build:
        from build_source_artifacts import build  # pdfplumber only needed here

        summary = build(key)
        print(
            f"[build] pages={summary['pages']} fragments={summary['fragments']} "
            f"-> {summary['fragments_path']}"
        )

    result = asyncio.run(_load(key))
    print(f"[load] {result}")


if __name__ == "__main__":
    main()
