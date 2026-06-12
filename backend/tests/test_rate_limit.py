"""Лимитер частоты ИИ-запросов: превышение лимита даёт 429, юзеры независимы."""
import asyncio

import pytest
from fastapi import HTTPException

from backend.routes._ratelimit import _hits, rate_limit


class _User:
    def __init__(self, uid: int):
        self.id = uid


def test_rate_limit_blocks_after_limit():
    _hits.clear()
    dep = rate_limit("test-bucket", limit=10, window=60.0)

    async def run():
        user = _User(99001)
        for _ in range(10):
            await dep(current_user=user)
        with pytest.raises(HTTPException) as exc:
            await dep(current_user=user)
        assert exc.value.status_code == 429

    asyncio.run(run())


def test_rate_limit_users_are_independent():
    _hits.clear()
    dep = rate_limit("test-bucket-2", limit=1, window=60.0)

    async def run():
        await dep(current_user=_User(1))
        await dep(current_user=_User(2))  # другой пользователь — свой счётчик
        with pytest.raises(HTTPException):
            await dep(current_user=_User(1))

    asyncio.run(run())


def test_rate_limit_window_expires():
    _hits.clear()
    dep = rate_limit("test-bucket-3", limit=1, window=0.05)

    async def run():
        user = _User(7)
        await dep(current_user=user)
        await asyncio.sleep(0.06)
        await dep(current_user=user)  # окно прошло — снова можно

    asyncio.run(run())
