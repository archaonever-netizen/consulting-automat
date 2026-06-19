from typing import Any, Literal, Optional

import httpx
from fastapi import HTTPException


TokenType = Literal["oauth", "iam"]


class YandexTrackerClient:
    """Small async wrapper around Yandex Tracker REST API v3."""

    def __init__(
        self,
        token: str,
        *,
        token_type: TokenType = "oauth",
        org_id: Optional[str] = None,
        cloud_org_id: Optional[str] = None,
        timeout: float = 20.0,
    ):
        if not (org_id or cloud_org_id):
            raise ValueError("org_id or cloud_org_id is required")
        self.base_url = "https://api.tracker.yandex.net/v3"
        auth_prefix = "Bearer" if token_type == "iam" else "OAuth"
        self._headers = {
            "Authorization": f"{auth_prefix} {token}",
            "Content-Type": "application/json",
        }
        if cloud_org_id:
            self._headers["X-Cloud-Org-ID"] = cloud_org_id
        else:
            self._headers["X-Org-ID"] = org_id or ""
        self._timeout = timeout

    async def _request(self, method: str, path: str, **kwargs) -> Any:
        url = f"{self.base_url}{path}"
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.request(method, url, headers=self._headers, **kwargs)
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=502,
                detail=f"Не удалось связаться с Яндекс Трекером: {exc}",
            ) from exc
        return self._handle(resp)

    @staticmethod
    def _handle(resp: httpx.Response) -> Any:
        if resp.status_code == 401:
            raise HTTPException(status_code=400, detail="Неверный токен Яндекс Трекера")
        if resp.status_code == 403:
            raise HTTPException(status_code=403, detail="Нет доступа к ресурсу Яндекс Трекера")
        if resp.status_code == 404:
            raise HTTPException(status_code=404, detail="Ресурс Яндекс Трекера не найден")
        if resp.status_code == 429:
            raise HTTPException(status_code=429, detail="Превышен лимит запросов к Яндекс Трекеру")
        if resp.status_code >= 400:
            raise HTTPException(
                status_code=resp.status_code,
                detail=f"Ошибка Яндекс Трекера: {resp.text[:300]}",
            )
        if resp.status_code == 204 or not resp.content:
            return None
        return resp.json()

    async def get_current_user(self) -> dict:
        return await self._request("GET", "/myself")

    async def list_queues(self, *, expand: Optional[str] = None, per_page: int = 50) -> list:
        params: dict[str, Any] = {"perPage": per_page}
        if expand:
            params["expand"] = expand
        return await self._request("GET", "/queues/", params=params)

    async def search_issues(
        self,
        payload: dict[str, Any],
        *,
        expand: Optional[str] = None,
        fields: Optional[str] = None,
        per_page: int = 50,
        page: Optional[int] = None,
        page_id: Optional[str] = None,
    ) -> list:
        params: dict[str, Any] = {"perPage": per_page}
        if expand:
            params["expand"] = expand
        if fields:
            params["fields"] = fields
        if page is not None:
            params["page"] = page
        if page_id:
            params["id"] = page_id
        return await self._request("POST", "/issues/_search", params=params, json=payload)

    async def get_issue(
        self,
        issue_id: str,
        *,
        expand: Optional[str] = None,
        fields: Optional[str] = None,
    ) -> dict:
        params: dict[str, Any] = {}
        if expand:
            params["expand"] = expand
        if fields:
            params["fields"] = fields
        return await self._request("GET", f"/issues/{issue_id}", params=params)

    async def create_issue(self, payload: dict[str, Any]) -> dict:
        return await self._request("POST", "/issues/", json=payload)

    async def update_issue(
        self,
        issue_id: str,
        payload: dict[str, Any],
        *,
        version: Optional[int] = None,
    ) -> dict:
        params = {"version": version} if version is not None else None
        return await self._request("PATCH", f"/issues/{issue_id}", params=params, json=payload)

    async def list_transitions(self, issue_id: str) -> list:
        return await self._request("GET", f"/issues/{issue_id}/transitions")

    async def execute_transition(
        self,
        issue_id: str,
        transition_id: str,
        payload: dict[str, Any],
    ) -> list:
        return await self._request(
            "POST",
            f"/issues/{issue_id}/transitions/{transition_id}/_execute",
            json=payload,
        )
