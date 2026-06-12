"""Ограничение частоты запросов к дорогим ИИ-эндпоинтам (per-user, in-memory).

Каждый вызов чата или декомпозиции — это платный запрос к LLM-провайдеру.
Лимитер не даёт одному пользователю (или сбоящему клиенту в цикле) случайно
сжечь бюджет: не более `limit` запросов за `window` секунд на пользователя.

Прод работает одним процессом uvicorn (см. Dockerfile), поэтому памяти
процесса достаточно — внешние зависимости (Redis, slowapi) не нужны.
"""
import time
from collections import defaultdict, deque

from fastapi import Depends, HTTPException

from .auth import get_current_user_dep

_hits: dict[tuple[str, int], deque] = defaultdict(deque)


def rate_limit(name: str, limit: int, window: float = 60.0):
    """Зависимость FastAPI: счётчик `name` общий для всех роутов, где он указан."""

    async def dep(current_user=Depends(get_current_user_dep)):
        q = _hits[(name, current_user.id)]
        now = time.monotonic()
        while q and now - q[0] > window:
            q.popleft()
        if len(q) >= limit:
            raise HTTPException(
                status_code=429,
                detail="Слишком много запросов к ИИ — подождите минуту и попробуйте снова.",
            )
        q.append(now)

    return dep
