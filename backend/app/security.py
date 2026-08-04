"""
Authentication & security helpers.

 * Passwords are hashed with Argon2id (memory-hard, OWASP recommended).
 * Sessions use short-ish signed JWTs (HS256) carrying only the user id.
 * `current_user` is the FastAPI dependency every protected route uses.
 * Anonymous "guest" accounts let the mobile MVP work without a signup wall
   while still isolating each device's data.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, VerificationError, InvalidHashError
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import settings
from .database import execute, new_id, query_one, utcnow

_hasher = PasswordHasher()
_bearer = HTTPBearer(auto_error=False)


# --------------------------------------------------------------------------
# Password hashing
# --------------------------------------------------------------------------
def hash_password(raw: str) -> str:
    return _hasher.hash(raw)


def verify_password(raw: str, hashed: str | None) -> bool:
    if not hashed:
        return False
    try:
        return _hasher.verify(hashed, raw)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


# --------------------------------------------------------------------------
# JWT
# --------------------------------------------------------------------------
def create_access_token(user_id: str, extra: dict[str, Any] | None = None) -> str:
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": user_id,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=settings.ACCESS_TOKEN_TTL_MIN)).timestamp()),
        "iss": "ajay-ai-assistant",
    }
    payload.update(extra or {})
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> dict[str, Any]:
    try:
        return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired, please sign in again")
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid authentication token")


# --------------------------------------------------------------------------
# User helpers
# --------------------------------------------------------------------------
def create_user(
    *,
    name: str = "Friend",
    email: str | None = None,
    password: str | None = None,
    device_id: str | None = None,
    is_guest: bool = False,
) -> dict[str, Any]:
    uid = new_id()
    execute(
        "INSERT INTO users(id, email, name, password_hash, device_id, is_guest, created_at) "
        "VALUES(?,?,?,?,?,?,?)",
        (
            uid,
            (email or None) and email.lower().strip(),
            name.strip() or "Friend",
            hash_password(password) if password else None,
            device_id,
            int(is_guest),
            utcnow(),
        ),
    )
    return get_user(uid)  # type: ignore[return-value]


def get_user(user_id: str) -> dict[str, Any] | None:
    return query_one(
        "SELECT id, email, name, device_id, is_guest, created_at FROM users WHERE id=?",
        (user_id,),
    )


def get_user_by_email(email: str) -> dict[str, Any] | None:
    return query_one("SELECT * FROM users WHERE email=?", (email.lower().strip(),))


def get_user_by_device(device_id: str) -> dict[str, Any] | None:
    return query_one("SELECT * FROM users WHERE device_id=? AND is_guest=1", (device_id,))


# --------------------------------------------------------------------------
# FastAPI dependency
# --------------------------------------------------------------------------
async def current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> dict[str, Any]:
    """Resolve the caller from the `Authorization: Bearer <jwt>` header."""
    if creds is None or not creds.credentials:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Missing bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = decode_token(creds.credentials)
    user = get_user(str(payload.get("sub", "")))
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Account no longer exists")
    return user
