"""Async-обёртка над Kaiten REST API (https://<домен>.kaiten.ru/api/v1).

Тонкий клиент: аутентификация Bearer-токеном, единый разбор ошибок и лимита
5 req/s (HTTP 429). Бизнес-логики тут нет — это транспорт к Kaiten.
"""
from typing import Any, Optional

import httpx
from fastapi import HTTPException

# Один общий пул соединений на весь процесс: keep-alive переиспользует TCP/TLS к
# kaiten.ru между всеми запросами (раньше клиент создавался на каждый вызов и
# платил полное TLS-рукопожатие — +100–300 мс к каждому из 5–6 вызовов загрузки).
_shared_client: Optional[httpx.AsyncClient] = None


def get_shared_client() -> httpx.AsyncClient:
    global _shared_client
    if _shared_client is None or _shared_client.is_closed:
        _shared_client = httpx.AsyncClient(
            timeout=20.0,
            limits=httpx.Limits(max_keepalive_connections=20, keepalive_expiry=60.0),
        )
    return _shared_client


async def close_shared_client() -> None:
    global _shared_client
    if _shared_client is not None and not _shared_client.is_closed:
        await _shared_client.aclose()
    _shared_client = None


class KaitenClient:
    def __init__(self, domain: str, token: str, timeout: float = 20.0):
        self.base_url = f"https://{domain}/api/v1"
        self._headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
        self._timeout = timeout

    async def _request(self, method: str, path: str, **kwargs) -> Any:
        url = f"{self.base_url}{path}"
        try:
            client = get_shared_client()
            resp = await client.request(
                method, url, headers=self._headers, timeout=self._timeout, **kwargs
            )
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=502,
                detail=f"Не удалось связаться с Kaiten: {exc}",
            )
        return self._handle(resp)

    @staticmethod
    def _handle(resp: httpx.Response) -> Any:
        if resp.status_code == 401:
            raise HTTPException(status_code=400, detail="Неверный токен или домен Kaiten")
        if resp.status_code == 403:
            raise HTTPException(status_code=403, detail="Нет доступа к ресурсу Kaiten")
        if resp.status_code == 404:
            raise HTTPException(status_code=404, detail="Ресурс Kaiten не найден")
        if resp.status_code == 429:
            raise HTTPException(
                status_code=429,
                detail="Превышен лимит запросов к Kaiten (5 req/s), повторите позже",
            )
        if resp.status_code >= 400:
            raise HTTPException(
                status_code=resp.status_code,
                detail=f"Ошибка Kaiten: {resp.text[:300]}",
            )
        if resp.status_code == 204 or not resp.content:
            return None
        return resp.json()

    # ── Аутентификация / профиль ──
    async def get_current_user(self) -> dict:
        return await self._request("GET", "/users/current")

    async def list_users(self) -> list:
        """Пользователи организации — для назначения исполнителей."""
        return await self._request("GET", "/users")

    # ── Пространства и доски ──
    async def list_spaces(self) -> list:
        return await self._request("GET", "/spaces")

    async def list_boards(self, space_id: int) -> list:
        return await self._request("GET", f"/spaces/{space_id}/boards")

    async def get_board(self, board_id: int) -> dict:
        return await self._request("GET", f"/boards/{board_id}")

    async def list_cards(self, board_id: int) -> list:
        # additional_card_fields=members подгружает исполнителей сразу в список,
        # чтобы рисовать аватары без отдельного запроса на каждую карточку.
        return await self._request(
            "GET", "/cards",
            params={"board_id": board_id, "additional_card_fields": "members"},
        )

    # ── Карточки ──
    async def get_card(self, card_id: int) -> dict:
        return await self._request("GET", f"/cards/{card_id}")

    async def create_card(self, payload: dict) -> dict:
        return await self._request("POST", "/cards", json=payload)

    async def update_card(self, card_id: int, payload: dict) -> dict:
        return await self._request("PATCH", f"/cards/{card_id}", json=payload)

    async def delete_card(self, card_id: int) -> None:
        return await self._request("DELETE", f"/cards/{card_id}")

    # ── Исполнители карточки ──
    async def add_member(self, card_id: int, user_id: int) -> dict:
        return await self._request(
            "POST", f"/cards/{card_id}/members", json={"user_id": user_id}
        )

    async def remove_member(self, card_id: int, user_id: int) -> None:
        return await self._request("DELETE", f"/cards/{card_id}/members/{user_id}")
