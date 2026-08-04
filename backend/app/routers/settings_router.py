"""Settings routes: voice, language, privacy — plus full account deletion."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends

from ..database import DEFAULT_SETTINGS, execute, get_settings_for, save_settings_for
from ..schemas import SettingsIn
from ..security import current_user

router = APIRouter(prefix="/api/settings", tags=["settings"])

# Voice catalogue exposed to the Settings screen. `tts` maps to the voice the
# Flutter client requests from the platform TTS engine.
VOICES = [
    {"id": "female_warm", "label": "Aria (warm, female)", "locale": "en-IN", "pitch": 1.0, "rate": 0.48},
    {"id": "female_bright", "label": "Meera (bright, female)", "locale": "hi-IN", "pitch": 1.12, "rate": 0.5},
    {"id": "male_deep", "label": "Arjun (deep, male)", "locale": "en-IN", "pitch": 0.86, "rate": 0.46},
    {"id": "male_calm", "label": "Kabir (calm, male)", "locale": "hi-IN", "pitch": 0.95, "rate": 0.45},
]

LANGUAGES = [
    {"id": "auto", "label": "Auto detect (Hindi + English)"},
    {"id": "en-IN", "label": "English (India)"},
    {"id": "hi-IN", "label": "हिंदी (भारत)"},
]


@router.get("")
def read_settings(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    return {
        "settings": get_settings_for(user["id"]),
        "defaults": DEFAULT_SETTINGS,
        "voices": VOICES,
        "languages": LANGUAGES,
    }


@router.patch("")
def update_settings(body: SettingsIn, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    return {"settings": save_settings_for(user["id"], body.model_dump(exclude_none=True))}


@router.delete("/account")
def delete_account(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    """
    GDPR-style right to erasure.

    ON DELETE CASCADE removes messages, history, memory, tasks, reminders,
    notes and settings in one transaction.
    """
    execute("DELETE FROM users WHERE id=?", (user["id"],))
    return {"deleted": True}
