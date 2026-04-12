"""Symmetric encryption for secrets stored in the database.

Uses Fernet (AES-128-CBC + HMAC-SHA256) from the ``cryptography`` library.
The encryption key is loaded from the ``ENCRYPTION_KEY`` environment variable.
In development, if no key is set, one is auto-generated and persisted to
``data/.encryption_key`` next to the SQLite database so it survives restarts.
"""

from __future__ import annotations

import base64
import logging
import os
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken

logger = logging.getLogger(__name__)

_fernet: Fernet | None = None


def _resolve_key() -> bytes:
    """Resolve the 32-byte Fernet key from env or file-backed auto-generation."""
    from codebox_orchestrator.config import ENCRYPTION_KEY  # noqa: PLC0415

    if ENCRYPTION_KEY:
        # Accept raw base64 URL-safe key (Fernet expects url-safe-base64 of 32 bytes)
        try:
            return base64.urlsafe_b64decode(ENCRYPTION_KEY)
        except Exception:
            # If the value isn't valid base64, derive a key via SHA-256
            import hashlib  # noqa: PLC0415

            return hashlib.sha256(ENCRYPTION_KEY.encode()).digest()

    # Auto-generate and persist for development
    from codebox_orchestrator.config import DATABASE_URL  # noqa: PLC0415

    if DATABASE_URL.startswith("sqlite"):
        db_path = DATABASE_URL.split("///", 1)[-1]
        key_file = Path(db_path).parent / ".encryption_key"
    else:
        key_file = Path("data/.encryption_key")

    key_file.parent.mkdir(parents=True, exist_ok=True)

    if key_file.exists():
        raw = key_file.read_text().strip()
        return base64.urlsafe_b64decode(raw)

    # Generate new key
    key_bytes = os.urandom(32)
    key_b64 = base64.urlsafe_b64encode(key_bytes).decode()
    key_file.write_text(key_b64)
    logger.warning(
        "ENCRYPTION_KEY not set -- generated and saved to %s. "
        "Back up this file or set ENCRYPTION_KEY for production.",
        key_file,
    )
    return key_bytes


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
