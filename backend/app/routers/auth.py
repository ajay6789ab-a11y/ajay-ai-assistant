"""Authentication routes: email signup/login plus anonymous device guests."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status

from ..database import save_settings_for
from ..schemas import GuestIn, LoginIn, RegisterIn, TokenOut
from ..security import (
    create_access_token,
    create_user,
    current_user,
    get_user_by_device,
    get_user_by_email,
    verify_password,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _public(user: dict[str, Any]) -> dict[str, Any]:
    """Strip password hashes before anything leaves the server."""
    return {
        "id": user["id"],
        "name": user["name"],
        "email": user.get("email"),
        "is_guest": bool(user.get("is_guest")),
        "created_at": user.get("created_at"),
    }


@router.post("/register", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
def register(body: RegisterIn) -> TokenOut:
    if get_user_by_email(body.email):
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")
    user = create_user(name=body.name, email=body.email, password=body.password)
    save_settings_for(user["id"], {})          # seed defaults
    return TokenOut(access_token=create_access_token(user["id"]), user=_public(user))


@router.post("/login", response_model=TokenOut)
def login(body: LoginIn) -> TokenOut:
    user = get_user_by_email(body.email)
    # Constant-ish response regardless of which half failed (no user enumeration).
    if not user or not verify_password(body.password, user.get("password_hash")):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    return TokenOut(access_token=create_access_token(user["id"]), user=_public(user))


@router.post("/guest", response_model=TokenOut)
def guest(body: GuestIn) -> TokenOut:
    """
    Frictionless entry for the mobile MVP.

    The device generates a random UUID once, keeps it in secure storage and
    exchanges it for a token. Data stays scoped to that device.
    """
    user = get_user_by_device(body.device_id)
    if not user:
        user = create_user(name=body.name, device_id=body.device_id, is_guest=True)
        save_settings_for(user["id"], {})
    return TokenOut(access_token=create_access_token(user["id"]), user=_public(user))


@router.get("/me")
def me(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    return _public(user)
