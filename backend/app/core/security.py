"""
Security utilities.
Mirrors: backend/src/config/security.ts (AES-256-GCM secret encryption)
      +  backend/src/modules/auth/auth.service.ts (bcrypt + jwt)
"""
import base64
import hashlib
import os
import re
import time
from datetime import datetime, timedelta, timezone

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)

# ---- Password hashing (bcrypt, matches bcryptjs hashes bit-for-bit) ----


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)


# ---- JWT ----

_DURATION_RE = re.compile(r"^(\d+)([smhd])$")


def _parse_duration_to_seconds(value: str) -> int:
    """Parses strings like '1h', '30d', '15m' the way jsonwebtoken's `expiresIn` does."""
    match = _DURATION_RE.match(value.strip())
    if not match:
        # Fall back: assume raw seconds if it's just digits
        if value.strip().isdigit():
            return int(value)
        raise ValueError(f"Invalid duration string: {value}")
    amount, unit = match.groups()
    amount = int(amount)
    multiplier = {"s": 1, "m": 60, "h": 3600, "d": 86400}[unit]
    return amount * multiplier


def create_access_token(payload: dict) -> str:
    expires_delta = timedelta(seconds=_parse_duration_to_seconds(settings.JWT_EXPIRES_IN))
    to_encode = payload.copy()
    now = datetime.now(timezone.utc)
    to_encode.update({"iat": int(now.timestamp()), "exp": int((now + expires_delta).timestamp())})
    return jwt.encode(to_encode, settings.JWT_SECRET, algorithm="HS256")


def decode_access_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
    except JWTError as exc:
        raise ValueError("Authentication token is invalid or expired") from exc


# ---- AES-256-GCM secret encryption (for provider API keys) ----
# Format matches the Node version: "<iv_b64>.<tag_b64>.<ciphertext_b64>"


def _derive_key() -> bytes:
    raw = settings.ENCRYPTION_KEY.encode("utf-8")
    try:
        decoded = base64.b64decode(settings.ENCRYPTION_KEY, validate=True)
        if len(decoded) == 32:
            return decoded
    except Exception:
        pass
    return hashlib.sha256(raw).digest()


_KEY = _derive_key()


def encrypt_secret(value: str) -> str:
    iv = os.urandom(12)
    aesgcm = AESGCM(_KEY)
    ciphertext_with_tag = aesgcm.encrypt(iv, value.encode("utf-8"), None)
    # cryptography's AESGCM appends the 16-byte tag to the ciphertext; Node keeps them separate.
    ciphertext, tag = ciphertext_with_tag[:-16], ciphertext_with_tag[-16:]
    return ".".join(
        base64.b64encode(part).decode("ascii") for part in (iv, tag, ciphertext)
    )


def decrypt_secret(value: str) -> str:
    parts = value.split(".")
    if len(parts) != 3:
        raise ValueError("Encrypted secret format is invalid")
    iv, tag, ciphertext = (base64.b64decode(p) for p in parts)
    aesgcm = AESGCM(_KEY)
    plaintext = aesgcm.decrypt(iv, ciphertext + tag, None)
    return plaintext.decode("utf-8")
