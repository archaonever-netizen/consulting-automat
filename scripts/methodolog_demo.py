"""Run the Methodolog agent on sample reasonings and print full answers."""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.services.methodolog import ask_methodolog  # noqa: E402

REASONINGS = [
    "Сначала надо внедрить единый стандарт процессов для всех отделов, а потом уже "
    "заставить команды соблюдать регулярное планирование.",
    "Чтобы повысить зрелость, достаточно купить хороший софт для управления процессами.",
    "Мы измеряем процессы только когда что-то ломается — в остальное время это лишняя бюрократия.",
]


async def main() -> None:
    queries = sys.argv[1:] or REASONINGS
    for n, q in enumerate(queries, 1):
        result = await ask_methodolog(q)
        print("\n" + "=" * 78)
        print(f"РАССУЖДЕНИЕ {n}: {q}")
        print("=" * 78)
        print(result["answer"])
        print("\n--- найденные выдержки (для проверки честности ссылок) ---")
        for i, h in enumerate(result["evidence"], 1):
            tag = h.card_type or "fragment"
            print(f"  S{i} [{tag}] {h.source_key} стр.{h.page_start}-{h.page_end} "
                  f"раздел «{(h.section or h.title)[:50]}»")


if __name__ == "__main__":
    asyncio.run(main())
