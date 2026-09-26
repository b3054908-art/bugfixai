"""Mirrors: backend/src/config/security.ts (AES-256-GCM secret encryption)"""
import base64
import hashlib
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.core.config import settings


def _key() -> bytes:
    raw = settings.ENCRYPTION_KEY
    try:
        decoded = base64.b64decode(raw, validate=True)
        if len(decoded) == 32:
            return decoded
    except Exception:
        pass
    return hashlib.sha256(raw.encode("utf-8")).digest()


def encrypt_secret(value: str) -> str:
    key = _key()
    iv = os.urandom(12)
    aesgcm = AESGCM(key)
    ciphertext = aesgcm.encrypt(iv, value.encode("utf-8"), None)
    # AESGCM appends the 16-byte tag to the ciphertext; split it out to match
    # the Node implementation's iv.tag.ciphertext format.
    encrypted, tag = ciphertext[:-16], ciphertext[-16:]
    return ".".join(
        base64.b64encode(part).decode("ascii") for part in (iv, tag, encrypted)
    )


def decrypt_secret(value: str) -> str:
    parts = value.split(".")
    if len(parts) != 3:
        raise ValueError("Encrypted secret format is invalid")
    iv, tag, encrypted = (base64.b64decode(p) for p in parts)
    key = _key()
    aesgcm = AESGCM(key)
    plaintext = aesgcm.decrypt(iv, encrypted + tag, None)
    return plaintext.decode("utf-8")
