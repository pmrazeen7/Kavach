"""Enterprise Authentication, JWT & Password Hashing Engine."""

import base64
import hashlib
import hmac
import json
import os
import time
from typing import Any

# Secret key for signing JWT tokens
JWT_SECRET = os.getenv("JWT_SECRET", "netrika-enterprise-super-secret-key-2026")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_SECONDS = 86400 * 7  # 7 days
REFRESH_TOKEN_EXPIRE_SECONDS = 86400 * 30  # 30 days


# ── Password Hashing Engine (HMAC-SHA256 PBKDF2) ──────────────────

def hash_password(password: str) -> str:
    """Hash a password using PBKDF2 HMAC-SHA256 with random salt."""
    salt = os.urandom(16)
    key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 100_000)
    return f"{salt.hex()}${key.hex()}"


def verify_password(password: str, hashed_password: str) -> bool:
    """Verify a plain password against PBKDF2 hash."""
    try:
        if ":" not in hashed_password and "$" not in hashed_password:
            return False
        delim = "$" if "$" in hashed_password else ":"
        salt_hex, key_hex = hashed_password.split(delim, 1)
        salt = bytes.fromhex(salt_hex)
        expected_key = bytes.fromhex(key_hex)
        new_key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 100_000)
        return hashlib.sha256(new_key).digest() == hashlib.sha256(expected_key).digest()
    except Exception:
        return False


# ── JWT Engine ─────────────────────────────────────────────────────

def _base64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("utf-8")


def _base64url_decode(data_str: str) -> bytes:
    padding = "=" * (4 - (len(data_str) % 4))
    return base64.urlsafe_b64decode(data_str + padding)


def create_access_token(data: dict[str, Any], expires_delta: int = ACCESS_TOKEN_EXPIRE_SECONDS) -> str:
    """Create a signed JWT access token."""
    header = {"alg": "HS256", "typ": "JWT"}
    payload = data.copy()
    now = int(time.time())
    payload["iat"] = now
    payload["exp"] = now + expires_delta

    header_b64 = _base64url_encode(json.dumps(header).encode("utf-8"))
    payload_b64 = _base64url_encode(json.dumps(payload).encode("utf-8"))

    signature_input = f"{header_b64}.{payload_b64}".encode("utf-8")
    signature = hmac.new(JWT_SECRET.encode("utf-8"), signature_input, hashlib.sha256).digest()
    signature_b64 = _base64url_encode(signature)

    return f"{header_b64}.{payload_b64}.{signature_b64}"


def create_refresh_token(user_id: str, org_id: str) -> str:
    """Create a long-lived refresh token."""
    return create_access_token({"sub": user_id, "org_id": org_id, "type": "refresh"}, expires_delta=REFRESH_TOKEN_EXPIRE_SECONDS)


def decode_token(token: str) -> dict[str, Any] | None:
    """Decode and verify a signed JWT token."""
    try:
        parts = token.strip().split(".")
        if len(parts) != 3:
            return None

        header_b64, payload_b64, signature_b64 = parts
        signature_input = f"{header_b64}.{payload_b64}".encode("utf-8")
        expected_sig = _base64url_encode(hmac.new(JWT_SECRET.encode("utf-8"), signature_input, hashlib.sha256).digest())

        if signature_b64 != expected_sig:
            return None

        payload = json.loads(_base64url_decode(payload_b64).decode("utf-8"))
        if payload.get("exp", 0) < time.time():
            return None

        return payload
    except Exception:
        return None
