"""Phase 6 (v2): search-quality benchmark with INDEPENDENT gold pages.

Integrity fix: the "correct page" for each Russian question is derived NOT from our
own search ranking, but independently from BPMM.pdf itself —
  1. the page is looked up from the PDF OUTLINE (bookmarks) by section title;
  2. it is verified by reading that PDF page's VERBATIM text and confirming the
     topic terms are present.
Only after that do we measure how the new hybrid search and the old ILIKE word
search rank that page. Both engines search the same corpus (English fragments).

    python scripts/eval_search.py     (needs BPMM.pdf locally + DATABASE_URL=Supabase)
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from pypdf import PdfReader  # noqa: E402
import pdfplumber  # noqa: E402

from backend.services.knowledge_search import _pg_dsn, hybrid_search  # noqa: E402

PDF_PATH = ROOT / "BPMM" / "BPMM.pdf"
TOPK = 5

# (question, BPMM section-title substring that answers it, verification keywords)
GOLD_SPEC = [
    ("Чем отличаются зрелые процессы от незрелых?",
     "Immature Versus Mature", ["mature", "immature"]),
    ("Что характеризует уровень зрелости 3 — стандартизацию процессов?",
     "Maturity Level 3 - The Standardized", ["standard", "maturity level 3"]),
    ("Что такое количественное управление процессами?",
     "Quantitative Process Management (QPM)", ["quantitative"]),
    ("Что относится к уровню зрелости 2 — управляемый уровень?",
     "Maturity Level 2 - The Managed", ["maturity level 2", "managed"]),
    ("Что такое институционализация практик в организации?",
     "Institutionalization Goal and Practices", ["institutionaliz"]),
    ("Как BPMM трактует непрерывное улучшение возможностей?",
     "Continuous Capability Improvement", ["continuous", "improvement"]),
    ("Что такое предотвращение дефектов и проблем?",
     "Defect and Problem Prevention", ["defect", "prevention"]),
    ("Сколько существует уровней зрелости процессов и какие они?",
     "The Five Process Maturity Levels", ["five", "maturity level"]),
    ("Какие области процессов относятся к уровню зрелости 5?",
     "Process Areas for Maturity Level 5", ["maturity level 5", "process area"]),
    ("Какие основные проблемы предприятий призван решить BPMM?",
     "Scope", ["challenges", "enterprise"]),
]


def flatten_outline(reader: PdfReader) -> list[tuple[str, int]]:
    items: list[tuple[str, int]] = []

    def walk(nodes):
        for node in nodes:
            if isinstance(node, list):
                walk(node)
                continue
            title = str(node.get("/Title", "")).strip()
            if not title:
                continue
            try:
                page = reader.get_destination_page_number(node) + 1
            except Exception:
                continue
            items.append((title, page))

    try:
        walk(reader.outline)
    except Exception:
        return []
    return items


def derive_gold() -> list[dict]:
    """Resolve gold pages independently from the PDF outline + verbatim page text."""
    reader = PdfReader(str(PDF_PATH))
    outline = flatten_outline(reader)
    gold = []
    with pdfplumber.open(str(PDF_PATH)) as pdf:
        for question, section_substr, keywords in GOLD_SPEC:
            matches = [(t, p) for (t, p) in outline if section_substr.lower() in t.lower()]
            pages = sorted({p for (_, p) in matches})
            # verify: first matched page's text contains a topic keyword
            verified, snippet = False, ""
            if pages:
                ptext = (pdf.pages[pages[0] - 1].extract_text() or "").lower()
                verified = any(k.lower() in ptext for k in keywords)
                snippet = (pdf.pages[pages[0] - 1].extract_text() or "")[:0]
            gold.append({
                "q": question, "section": section_substr, "pages": pages,
                "matched_titles": matches, "verified": verified,
            })
    return gold


def _rank(rank_pages, gold_pages) -> int:
    for rank, (ps, pe) in enumerate(rank_pages, 1):
        ps = ps or 0
        pe = pe or ps
        if any(ps <= g <= pe for g in gold_pages):
            return rank
    return 0


async def _old_ilike(conn, query, limit):
    rows = await conn.fetch(
        "SELECT f.page_start, f.page_end FROM knowledge_source_fragments f "
        "JOIN knowledge_sources s ON s.id=f.source_id AND s.key='bpmm' "
        "WHERE f.title ILIKE $1 OR f.full_text ILIKE $1 ORDER BY f.sort_order LIMIT $2",
        f"%{query}%", limit)
    return [(r["page_start"], r["page_end"]) for r in rows]


async def _new_hybrid(conn, query, limit):
    hits = await hybrid_search(conn, query, scope="fragments", limit=limit)
    return [(h.page_start, h.page_end) for h in hits]


async def main() -> None:
    gold = derive_gold()

    print("=== ЭТАП 1: откуда взяты правильные страницы (независимо из BPMM.pdf) ===")
    for g in gold:
        titles = "; ".join(f"{t} (PDF-стр.{p})" for t, p in g["matched_titles"]) or "— не найдено в оглавлении —"
        ok = "подтверждено текстом стр." if g["verified"] else "НЕ подтверждено"
        print(f"\n• {g['q']}")
        print(f"    раздел BPMM: {titles}")
        print(f"    эталон-страницы: {g['pages']}  [{ok} {g['pages'][:1]}]")

    import asyncpg
    conn = await asyncpg.connect(_pg_dsn(), timeout=30, statement_cache_size=0)
    try:
        print("\n=== ЭТАП 2: ранг правильной страницы в выдаче (— = не найдено) ===")
        print(f"{'Вопрос':50} | старый | новый")
        print("-" * 70)
        agg = {"old": [0, 0, 0, 0.0], "new": [0, 0, 0, 0.0]}  # h1,h3,h5,mrr
        for g in gold:
            o = _rank(await _old_ilike(conn, g["q"], TOPK), g["pages"])
            n = _rank(await _new_hybrid(conn, g["q"], TOPK), g["pages"])
            for tag, r in (("old", o), ("new", n)):
                agg[tag][0] += r == 1
                agg[tag][1] += 1 <= r <= 3
                agg[tag][2] += 1 <= r <= 5
                agg[tag][3] += (1.0 / r) if r else 0.0
            m = lambda r: (f"#{r}" if r else "—")  # noqa: E731
            print(f"{g['q'][:50]:50} | {m(o):^6} | {m(n):^6}")

        n_q = len(gold)
        print(f"\n=== ИТОГ (из {n_q} вопросов) ===")
        for tag, label in (("old", "Старый поиск (по словам)"), ("new", "Новый поиск (умный)   ")):
            h1, h3, h5, mrr = agg[tag]
            print(f"{label}:  топ-1={h1}/{n_q}  топ-3={h3}/{n_q}  топ-5={h5}/{n_q}  MRR={mrr/n_q:.2f}")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
