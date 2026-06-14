"""Generic source artifact builder for the knowledge library.

Reads `knowledge/<key>/manifest.json` + its PDF and produces two committed
artifacts next to the PDF:

  - `<key>.fulltext.txt`     verbatim extracted text (tables preserved)
  - `<key>.fragments.jsonl`  structure-based chunks with exact page anchors

Design choices (see docs/knowledge_sources.md):
  - The PDF stays the immutable first source (provenance). Runtime imports the
    committed text artifacts, never re-parses the PDF.
  - Text + tables are extracted with pdfplumber so table STRUCTURE is preserved
    (pypdf flattens tables into unreadable text).
  - The document OUTLINE (bookmarks) drives section boundaries, reusing the
    proven BPMM approach. Large sections are split into smaller sub-chunks that
    each carry HONEST page_start/page_end — page numbers are never invented.

Usage:
    python scripts/build_source_artifacts.py <key>
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pdfplumber
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
KNOWLEDGE_DIR = ROOT / "knowledge"

# Target chunk size in characters. Sections larger than this are split into
# page-aligned sub-chunks so the smart search returns focused passages.
TARGET_CHARS = 2500
# A single page longer than this is split further by paragraphs (still tagged
# with that one page number, so the citation stays exact).
PAGE_SPLIT_CHARS = int(TARGET_CHARS * 1.6)


def load_manifest(key: str) -> dict:
    manifest_path = KNOWLEDGE_DIR / key / "manifest.json"
    if not manifest_path.exists():
        raise SystemExit(f"manifest not found: {manifest_path}")
    return json.loads(manifest_path.read_text(encoding="utf-8"))


def _render_table(table: list[list]) -> str:
    """Render a pdfplumber table (rows of cells) as a structured text block."""
    lines = []
    for row in table:
        cells = [(c or "").replace("\n", " ").strip() for c in row]
        if any(cells):
            lines.append(" | ".join(cells))
    if not lines:
        return ""
    return "[ТАБЛИЦА]\n" + "\n".join(lines)


def extract_pages(pdf_path: Path) -> list[str]:
    """Per-page text with table structure preserved and appended."""
    page_texts: list[str] = []
    with pdfplumber.open(str(pdf_path)) as pdf:
        for page in pdf.pages:
            text = (page.extract_text() or "").strip()
            table_blocks = []
            try:
                for table in page.extract_tables():
                    block = _render_table(table)
                    if block:
                        table_blocks.append(block)
            except Exception:
                pass  # table detection is best-effort; never lose the page
            if table_blocks:
                text = (text + "\n\n" + "\n\n".join(table_blocks)).strip()
            page_texts.append(text)
    return page_texts


def flatten_outline(reader: PdfReader) -> list[dict]:
    items: list[dict] = []

    def walk(nodes, level: int = 0) -> None:
        for node in nodes:
            if isinstance(node, list):
                walk(node, level + 1)
                continue
            title = str(node.get("/Title", "")).strip()
            if not title:
                continue
            try:
                page = reader.get_destination_page_number(node) + 1
            except Exception:
                page = 1
            items.append({"title": title, "page": page, "level": level})

    try:
        walk(reader.outline)
    except Exception:
        return []
    return items


def next_outline_page(items: list[dict], index: int, current_page: int, page_count: int) -> int:
    for next_item in items[index + 1:]:
        page = int(next_item["page"])
        if page > current_page:
            return page
    return page_count + 1


def _split_long_page(text: str) -> list[str]:
    """Split a very long single page into paragraph windows (same page number)."""
    paras = [p.strip() for p in text.split("\n\n") if p.strip()]
    windows: list[str] = []
    cur = ""
    for para in paras:
        if cur and len(cur) + len(para) + 2 > TARGET_CHARS:
            windows.append(cur)
            cur = para
        else:
            cur = f"{cur}\n\n{para}" if cur else para
    if cur:
        windows.append(cur)
    return windows or [text]


def chunk_section(
    page_texts: list[str], start_page: int, end_page: int
) -> list[dict]:
    """Split one outline section into page-aligned sub-chunks with exact pages."""
    pages = [
        (pno, page_texts[pno - 1])
        for pno in range(start_page, end_page + 1)
        if page_texts[pno - 1].strip()
    ]
    if not pages:
        return []

    chunks: list[dict] = []
    cur_text = ""
    cur_start: int | None = None
    cur_end: int | None = None

    def flush() -> None:
        nonlocal cur_text, cur_start, cur_end
        if cur_text.strip() and cur_start is not None:
            chunks.append({
                "page_start": cur_start,
                "page_end": cur_end,
                "text": cur_text.strip(),
            })
        cur_text, cur_start, cur_end = "", None, None

    for pno, ptext in pages:
        # A single oversized page becomes its own paragraph-split chunks.
        if len(ptext) > PAGE_SPLIT_CHARS:
            flush()
            for window in _split_long_page(ptext):
                chunks.append({"page_start": pno, "page_end": pno, "text": window.strip()})
            continue
        if cur_text and len(cur_text) + len(ptext) + 2 > TARGET_CHARS:
            flush()
        if cur_start is None:
            cur_start = pno
        cur_end = pno
        cur_text = f"{cur_text}\n\n{ptext}" if cur_text else ptext
    flush()
    return chunks


def build(key: str) -> dict:
    manifest = load_manifest(key)
    source_dir = KNOWLEDGE_DIR / key
    pdf_path = source_dir / manifest["pdf_file"]
    if not pdf_path.exists():
        raise SystemExit(f"PDF not found: {pdf_path}")

    fulltext_path = source_dir / f"{key}.fulltext.txt"
    fragments_path = source_dir / f"{key}.fragments.jsonl"

    page_texts = extract_pages(pdf_path)
    full_text = "\n\n".join(page_texts).strip()
    fulltext_path.write_text(full_text, encoding="utf-8", newline="\n")

    reader = PdfReader(str(pdf_path))
    outline_items = flatten_outline(reader)
    if not outline_items:
        outline_items = [{"title": manifest.get("title", key), "page": 1, "level": 0}]

    order = 0
    fragment_count = 0
    with fragments_path.open("w", encoding="utf-8", newline="\n") as fragments:
        for index, item in enumerate(outline_items):
            start_page = max(1, int(item["page"]))
            next_page = next_outline_page(outline_items, index, start_page, len(page_texts))
            end_page = max(start_page, min(next_page - 1, len(page_texts)))
            sub_chunks = chunk_section(page_texts, start_page, end_page)
            for sub_index, chunk in enumerate(sub_chunks):
                title = str(item["title"]).strip()
                fragments.write(json.dumps({
                    "sort_order": order,
                    "title": title,
                    "outline_level": int(item["level"]),
                    "sub_index": sub_index,
                    "page_start": chunk["page_start"],
                    "page_end": chunk["page_end"],
                    "text": chunk["text"],
                }, ensure_ascii=False) + "\n")
                order += 1
                fragment_count += 1

    summary = {
        "key": key,
        "pages": len(page_texts),
        "fulltext_chars": len(full_text),
        "outline_items": len(outline_items),
        "fragments": fragment_count,
        "fulltext_path": str(fulltext_path.relative_to(ROOT)).replace("\\", "/"),
        "fragments_path": str(fragments_path.relative_to(ROOT)).replace("\\", "/"),
    }
    return summary


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: python scripts/build_source_artifacts.py <key>")
    summary = build(sys.argv[1])
    print(
        f"pages={summary['pages']} fulltext_chars={summary['fulltext_chars']} "
        f"outline_items={summary['outline_items']} fragments={summary['fragments']} "
        f"fulltext={summary['fulltext_path']} fragments_file={summary['fragments_path']}"
    )


if __name__ == "__main__":
    main()
