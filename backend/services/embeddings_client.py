"""Embeddings client (AITunnel, OpenAI-compatible).

Kept deliberately separate from the Promptra chat client (`llm_client.py`):
Promptra serves chat models only and has no embeddings endpoint, so embeddings
go through AITunnel with its own base_url + key.

Hard rule: the SAME model + dimension must be used for indexing and for search.
The active model is `settings.embeddings_model`; do not mix models in one index.
"""
from __future__ import annotations

from functools import lru_cache

from openai import OpenAI

from ..core.config import get_settings


@lru_cache
def get_embeddings_client() -> OpenAI:
    settings = get_settings()
    return OpenAI(
        api_key=settings.embeddings_api_key,
        base_url=settings.embeddings_base_url.rstrip("/"),
        timeout=60,
    )


def embed_texts_with_usage(
    texts: list[str], *, model: str | None = None, dim: int | None = None
) -> tuple[list[list[float]], int]:
    """Like embed_texts but also returns total tokens billed (for cost tracking)."""
    settings = get_settings()
    client = get_embeddings_client()
    response = client.embeddings.create(
        model=model or settings.embeddings_model,
        input=texts,
        dimensions=dim or settings.embeddings_dim,
    )
    usage = getattr(response, "usage", None)
    tokens = int(getattr(usage, "total_tokens", 0) or 0)
    return [item.embedding for item in response.data], tokens


def embed_texts(
    texts: list[str], *, model: str | None = None, dim: int | None = None
) -> list[list[float]]:
    """Return one embedding vector per input text (order preserved).

    The dimension is pinned to `settings.embeddings_dim` (1536) so indexing and
    search always match. text-embedding-3-large supports the `dimensions` param.
    """
    vectors, _ = embed_texts_with_usage(texts, model=model, dim=dim)
    return vectors


def embed_text(text: str, *, model: str | None = None, dim: int | None = None) -> list[float]:
    """Convenience wrapper for a single string."""
    return embed_texts([text], model=model, dim=dim)[0]
