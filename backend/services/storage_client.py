"""Supabase Storage helper for source PDFs (server-only).

Stores the original PDF of each knowledge source in a private bucket. Uses the
service_role key (bypasses RLS) — must never be exposed to the frontend.

Thin wrapper over the Storage REST API via httpx; no extra dependency.
"""
from __future__ import annotations

import httpx

from ..core.config import get_settings


def _cfg():
    s = get_settings()
    if not s.supabase_url or not s.supabase_service_key:
        raise RuntimeError("Supabase Storage не настроен: задайте SUPABASE_URL и SUPABASE_SERVICE_KEY.")
    base = s.supabase_url.rstrip("/") + "/storage/v1"
    headers = {
        "apikey": s.supabase_service_key,
        "Authorization": f"Bearer {s.supabase_service_key}",
    }
    return base, headers, s.supabase_storage_bucket


def ensure_bucket() -> str:
    """Create the private bucket if it does not exist (idempotent)."""
    base, headers, bucket = _cfg()
    with httpx.Client(timeout=30) as client:
        r = client.post(
            f"{base}/bucket", headers=headers,
            json={"id": bucket, "name": bucket, "public": False},
        )
        if r.status_code in (200, 201):
            return "created"
        # already exists → fine
        if r.status_code in (400, 409) and "exist" in r.text.lower():
            return "exists"
        r.raise_for_status()
        return "ok"


def upload(path: str, data: bytes, *, content_type: str = "application/pdf") -> str:
    """Upload (or overwrite) an object at <bucket>/<path>. Returns the storage path."""
    base, headers, bucket = _cfg()
    with httpx.Client(timeout=120) as client:
        r = client.post(
            f"{base}/object/{bucket}/{path}",
            headers={**headers, "Content-Type": content_type, "x-upsert": "true"},
            content=data,
        )
        r.raise_for_status()
    return f"{bucket}/{path}"


def download(path: str) -> bytes:
    """Download the object bytes at <bucket>/<path>."""
    base, headers, bucket = _cfg()
    with httpx.Client(timeout=120) as client:
        r = client.get(f"{base}/object/{bucket}/{path}", headers=headers)
        r.raise_for_status()
        return r.content


def delete(path: str) -> None:
    """Delete the object at <bucket>/<path> (no error if already gone).

    Supabase returns 400 (not 404) for a missing object, so treat 400/404 as
    a no-op success rather than an error.
    """
    base, headers, bucket = _cfg()
    with httpx.Client(timeout=30) as client:
        r = client.delete(f"{base}/object/{bucket}/{path}", headers=headers)
        if r.status_code not in (200, 400, 404):
            r.raise_for_status()


def exists(path: str) -> bool:
    # HEAD reflects truth immediately; a plain GET can serve a stale 200 from the
    # CDN cache right after a delete, so don't use GET for existence.
    base, headers, bucket = _cfg()
    with httpx.Client(timeout=30) as client:
        r = client.head(f"{base}/object/{bucket}/{path}", headers=headers)
        return r.status_code == 200
