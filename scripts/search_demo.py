"""Quick demo of the hybrid knowledge search (Phase 4).

    python scripts/search_demo.py "ваш запрос" [--scope cards|fragments|both]
                                  [--methodology BPMM] [--type method_card|typical_error|diagnostic_question]

With no query, runs a few preset Russian queries. DB from DATABASE_URL (Supabase).
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.services.knowledge_search import search  # noqa: E402

PRESETS = [
    "что такое уровень зрелости процессов",
    "типичные ошибки при внедрении управления процессами",
    "какие вопросы задать чтобы оценить зрелость организации",
]


async def run_one(query: str, scope: str, methodology: str | None, card_type: str | None) -> None:
    hits = await search(query, scope=scope, methodology=methodology, card_type=card_type, limit=6)
    print(f"\n=== Запрос: {query}  (scope={scope}"
          + (f", type={card_type}" if card_type else "") + ") ===")
    if not hits:
        print("  (ничего не найдено)")
        return
    for i, h in enumerate(hits, 1):
        tag = h.card_type or "fragment"
        v = f"v={h.vscore:.2f}" if h.vscore is not None else "v=-"
        k = f"k={h.kscore:.3f}" if h.kscore is not None else "k=-"
        print(f"  {i}. [{tag}] rrf={h.rrf:.4f} {v} {k}  "
              f"{h.source_key} стр.{h.page_start}-{h.page_end}")
        print(f"     {h.title} — {h.text[:110].strip()}…")


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("query", nargs="?", default=None)
    ap.add_argument("--scope", default="both", choices=["cards", "fragments", "both"])
    ap.add_argument("--methodology", default=None)
    ap.add_argument("--type", dest="card_type", default=None)
    args = ap.parse_args()

    queries = [args.query] if args.query else PRESETS
    for q in queries:
        await run_one(q, args.scope, args.methodology, args.card_type)


if __name__ == "__main__":
    asyncio.run(main())
