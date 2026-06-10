"""Симметричное шифрование секретов в БД (токены интеграций).

Ключ Fernet детерминированно выводится из settings.secret_key, чтобы не
вводить отдельную env-переменную и не ломать существующий деплой. При смене
secret_key ранее зашифрованные значения станут нечитаемыми — это ожидаемо.
"""
import base64
import hashlib
from functools import lru_cache

from cryptography.fernet import Fernet

from .config import get_settings


@lru_cache()
def _fernet() -> Fernet:
    secret = get_settings().secret_key.encode("utf-8")
    key = base64.urlsafe_b64encode(hashlib.sha256(secret).digest())
    return Fernet(key)


def encrypt(plaintext: str) -> str:
    """Зашифровать строку → base64-токен Fernet."""
    return _fernet().encrypt(plaintext.encode("utf-8")).decode("utf-8")


def decrypt(token: str) -> str:
    """Расшифровать токен Fernet → исходную строку."""
    return _fernet().decrypt(token.encode("utf-8")).decode("utf-8")
