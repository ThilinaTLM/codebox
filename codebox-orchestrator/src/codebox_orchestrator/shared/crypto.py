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

    # 1. Try url-safe base64 (native Fernet key format: 44 chars → 32 bytes)
    try:
        decoded = base64.urlsafe_b64decode(key)
        if len(decoded) == 32:
            return decoded
    except Exception:  # noqa: S110
        pass

    # 2. Try hex decoding (common format: 64 hex chars → 32 bytes)
    try:
        decoded = bytes.fromhex(key)
        if len(decoded) == 32:
            return decoded
    except (ValueError, TypeError):
        pass

    # 3. Fallback: derive 32 bytes via SHA-256 for any arbitrary string
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


def encrypt_value_with_password(
    plaintext: str,
    password: str,
    salt: bytes,
    iterations: int = 600_000,
) -> str:
    """Encrypt a value using a password-derived Fernet key (PBKDF2-SHA256)."""
    fernet = _fernet_from_password(password, salt, iterations)
    return fernet.encrypt(plaintext.encode()).decode()


def decrypt_value_with_password(
    ciphertext: str,
    password: str,
    salt: bytes,
    iterations: int = 600_000,
) -> str:
    """Decrypt a value encrypted with :func:`encrypt_value_with_password`."""
    fernet = _fernet_from_password(password, salt, iterations)
    return fernet.decrypt(ciphertext.encode()).decode()


def _fernet_from_password(password: str, salt: bytes, iterations: int) -> Fernet:
    """Derive a Fernet instance from a password via PBKDF2-SHA256."""
    import hashlib  # noqa: PLC0415

    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, iterations)
    return Fernet(base64.urlsafe_b64encode(dk))


__all__ = [
    "InvalidToken",
    "decrypt_value",
    "decrypt_value_with_password",
    "encrypt_value",
    "encrypt_value_with_password",
    "get_fernet",
    "mask_secret",
]
