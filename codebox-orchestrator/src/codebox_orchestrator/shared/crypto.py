"""Symmetric encryption for secrets stored in the database.

Uses Fernet (AES-128-CBC + HMAC-SHA256) from the ``cryptography`` library.
The encryption key is loaded from the ``ENCRYPTION_KEY`` environment variable.
"""

from __future__ import annotations

import base64
import os

from cryptography.fernet import Fernet, InvalidToken

_fernet: Fernet | None = None


def _resolve_key() -> bytes:
    """Resolve the 32-byte Fernet key from the ENCRYPTION_KEY env var."""
    key = os.environ.get("ENCRYPTION_KEY", "")
    if not key:
        raise RuntimeError(
            "ENCRYPTION_KEY environment variable is required. "
            'Generate one with: python -c "from cryptography.fernet import Fernet; '
            'print(Fernet.generate_key().decode())"'
        )

    # Accept raw base64 URL-safe key (Fernet expects url-safe-base64 of 32 bytes)
    try:
        return base64.urlsafe_b64decode(key)
    except Exception:
        # If the value isn't valid base64, derive a key via SHA-256
        import hashlib  # noqa: PLC0415

        return hashlib.sha256(key.encode()).digest()


def get_fernet() -> Fernet:
    """Return a cached Fernet instance."""
    global _fernet  # noqa: PLW0603
    if _fernet is None:
        key_bytes = _resolve_key()
        fernet_key = base64.urlsafe_b64encode(key_bytes)
        _fernet = Fernet(fernet_key)
    return _fernet


def encrypt_value(plaintext: str) -> str:
    """Encrypt a plaintext string, returning a URL-safe base64 ciphertext."""
    return get_fernet().encrypt(plaintext.encode()).decode()


def decrypt_value(ciphertext: str) -> str:
    """Decrypt a ciphertext string back to plaintext.

    Raises ``cryptography.fernet.InvalidToken`` if the key is wrong or data corrupted.
    """
    return get_fernet().decrypt(ciphertext.encode()).decode()


def mask_secret(value: str, visible: int = 4) -> str:
    """Mask a secret for safe display.

    Examples::

        mask_secret("sk-or-v1-abc123xyz")  → "sk-...xyz"
        mask_secret("tvly-abc123")          → "tvly...c123"
        mask_secret("ab")                   → "****"
    """
    if len(value) <= visible * 2:
        return "****"
    return f"{value[:visible]}...{value[-visible:]}"


__all__ = [
    "InvalidToken",
    "decrypt_value",
    "encrypt_value",
    "get_fernet",
    "mask_secret",
]
