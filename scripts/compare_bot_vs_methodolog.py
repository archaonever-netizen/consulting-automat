r"""Сверка: контрольный пример через путь БОТА (run_bot_chat) и через ПРЯМОГО
Методолога (ask_methodolog). Печатает оба ответа рядом и вердикт по ссылкам.

Требует DATABASE_URL=Postgres (pgvector) — берётся из .env.local.
Запуск:  .\.venv\Scripts\python.exe scripts\compare_bot_vs_methodolog.py
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sqlalchemy import select  # noqa: E402

from backend.core.database import AsyncSessionLocal, Base, engine  # noqa: E402
from backend.models import Bot  # noqa: E402
from backend.services.bots import run_bot_chat, seed_bots  # noqa: E402
from backend.services.methodolog import ask_methodolog  # noqa: E402

CONTROL = (
    "Сначала надо внедрить единый стандарт процессов для всех отделов, а потом уже "
    "заставить команды соблюдать регулярное планирование."
)


def _ev_key(h) -> tuple:
    """Идентичность ссылки: источник + страницы (как в честных цитатах агента)."""
    return ((h.source_key or "").lower(), h.page_start, h.page_end)


def _ev_key_dict(e: dict) -> tuple:
    return ((e.get("source_key") or "").lower(), e.get("page_start"), e.get("page_end"))


async def main() -> None:
    # На первом прогоне против Postgres создаём недостающие бот-таблицы и сидим
    # Методолога идемпотентно (как делает lifespan приложения).
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with AsyncSessionLocal() as db:
        await seed_bots(db)
        bot = await db.scalar(select(Bot).where(Bot.key == "methodolog"))
        bot_id = bot.id

    # --- Путь БОТА (конфиг из БД: промпты, модель, фреймворк BPMM) ---
    async with AsyncSessionLocal() as db:
        bot_res = await run_bot_chat(db, bot_id, CONTROL, source="test")

    # --- Путь ПРЯМОГО Методолога (как scripts\methodolog_demo.py) ---
    direct = await ask_methodolog(CONTROL)

    line = "=" * 80
    print(f"\n{line}\nКОНТРОЛЬНЫЙ ПРИМЕР:\n{CONTROL}\n{line}")

    print("\n########## 1) ОТВЕТ ЧЕРЕЗ БОТА (run_bot_chat / methodolog) ##########\n")
    print(bot_res["answer"])
    print(f"\n[токены бота: {bot_res['usage']}]")
    print("\nИсточники бота:")
    for e in bot_res["evidence"]:
        pages = f"стр.{e['page_start']}-{e['page_end']}" if e["page_start"] else "—"
        print(f"  • {(e['source_key'] or '—').upper()} {pages} раздел «{(e['section'] or '')[:50]}»")

    print("\n########## 2) ОТВЕТ ПРЯМОГО МЕТОДОЛОГА (ask_methodolog) ##########\n")
    print(direct["answer"])
    print("\nИсточники прямого Методолога:")
    for h in direct["evidence"]:
        pages = f"стр.{h.page_start}-{h.page_end}" if h.page_start else "—"
        print(f"  • {(h.source_key or '—').upper()} {pages} раздел «{(h.section or h.title or '')[:50]}»")

    # --- Вердикт по ссылкам (множества источник+страницы) ---
    bot_set = {_ev_key_dict(e) for e in bot_res["evidence"]}
    dir_set = {_ev_key(h) for h in direct["evidence"]}
    inter = bot_set & dir_set
    union = bot_set | dir_set
    overlap = (len(inter) / len(union) * 100) if union else 0.0

    print(f"\n{line}\nВЕРДИКТ ПО ССЫЛКАМ\n{line}")
    print(f"  выдержек у бота: {len(bot_set)} | у прямого: {len(dir_set)} | общих: {len(inter)}")
    print(f"  совпадение набора источник+страницы: {overlap:.0f}%")
    only_bot = bot_set - dir_set
    only_dir = dir_set - bot_set
    if only_bot:
        print(f"  только у бота: {sorted(only_bot)}")
    if only_dir:
        print(f"  только у прямого: {sorted(only_dir)}")
    verdict = "СОВПАДАЮТ ПО СУТИ" if overlap >= 80 else ("ЧАСТИЧНО" if overlap >= 40 else "РАСХОДЯТСЯ")
    print(f"\n  ИТОГ: ссылки {verdict}.")
    print("  (Тексты ответов могут отличаться формулировками — модель неслучайна, "
          "temperature>0 — но разбор и цитаты должны быть одного качества.)")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
