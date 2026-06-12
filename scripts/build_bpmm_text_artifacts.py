from __future__ import annotations

import json
from pathlib import Path

from pypdf import PdfReader


ROOT = Path(__file__).resolve().parents[1]
PDF_PATH = ROOT / "BPMM" / "BPMM.pdf"
FULLTEXT_PATH = ROOT / "BPMM" / "BPMM.fulltext.txt"
FRAGMENTS_PATH = ROOT / "BPMM" / "BPMM.fragments.jsonl"


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


def main() -> None:
    reader = PdfReader(str(PDF_PATH))
    page_texts = [(page.extract_text() or "").strip() for page in reader.pages]
    full_text = "\n\n".join(page_texts).strip()
    FULLTEXT_PATH.write_text(full_text, encoding="utf-8", newline="\n")

    outline_items = flatten_outline(reader)
    if not outline_items:
        outline_items = [{"title": "BPMM", "page": 1, "level": 0}]

    with FRAGMENTS_PATH.open("w", encoding="utf-8", newline="\n") as fragments:
        for order, item in enumerate(outline_items):
            start_page = max(1, int(item["page"]))
            next_page = next_outline_page(outline_items, order, start_page, len(page_texts))
            end_page = max(start_page, min(next_page - 1, len(page_texts)))
            text = "\n\n".join(page_texts[start_page - 1:end_page]).strip()
            if not text:
                continue
            fragments.write(json.dumps({
                "sort_order": order,
                "title": str(item["title"]).strip(),
                "outline_level": int(item["level"]),
                "page_start": start_page,
                "page_end": end_page,
                "text": text,
            }, ensure_ascii=False) + "\n")

    print(
        f"pages={len(page_texts)} "
        f"fulltext_chars={len(full_text)} "
        f"outline_items={len(outline_items)} "
        f"fulltext={FULLTEXT_PATH} "
        f"fragments={FRAGMENTS_PATH}"
    )


if __name__ == "__main__":
    main()
