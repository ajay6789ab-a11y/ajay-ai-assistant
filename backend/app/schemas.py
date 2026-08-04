"""Pydantic request/response models (the public API contract)."""

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, EmailStr, Field


# ---------------------------------------------------------------- auth ----
class RegisterIn(BaseModel):
    name: str = Field(default="Friend", max_length=60)
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class GuestIn(BaseModel):
    device_id: str = Field(min_length=4, max_length=128)
    name: str = Field(default="Friend", max_length=60)


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict[str, Any]


# ----------------------------------------------------------- assistant ----
class Action(BaseModel):
    """A device action the Flutter client should execute."""

    type: str = "SPEAK_ONLY"
    params: dict[str, Any] = Field(default_factory=dict)
    requires_confirmation: bool = False
    confirmation_prompt: Optional[str] = None
    android_intent: Optional[str] = None       # hint for android_intent_plus
    url: Optional[str] = None                  # deep link / fallback URL


class ChatIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    source: Literal["voice", "text", "quick_action"] = "text"
    language: Optional[str] = None             # 'en' | 'hi' | None (auto-detect)
    client_time: Optional[str] = None          # ISO local time from the phone
    location: Optional[str] = None             # optional city for weather/news


class ChatOut(BaseModel):
    reply: str
    intent: str
    confidence: float
    language: str
    action: Action
    speak: bool = True
    data: dict[str, Any] = Field(default_factory=dict)
    message_id: str
    engine: str                                # 'llm' | 'rules'


# ------------------------------------------------------------- memory ----
class MemoryIn(BaseModel):
    key: str = Field(min_length=1, max_length=80)
    value: str = Field(max_length=1000)
    kind: Literal["preference", "fact", "contact", "habit"] = "preference"


# -------------------------------------------------------------- tasks ----
class TaskIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    notes: Optional[str] = None
    due_at: Optional[str] = None
    priority: int = Field(default=1, ge=0, le=2)


class TaskPatch(BaseModel):
    title: Optional[str] = None
    notes: Optional[str] = None
    due_at: Optional[str] = None
    priority: Optional[int] = Field(default=None, ge=0, le=2)
    done: Optional[bool] = None


# ---------------------------------------------------------- reminders ----
class ReminderIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    remind_at: str
    repeat: Literal["none", "daily", "weekly"] = "none"


# -------------------------------------------------------------- notes ----
class NoteIn(BaseModel):
    title: Optional[str] = Field(default=None, max_length=120)
    body: str = Field(min_length=1)
    audio_path: Optional[str] = None
    pinned: bool = False


# ----------------------------------------------------------- settings ----
class SettingsIn(BaseModel):
    language: Optional[str] = None
    voice: Optional[str] = None
    speech_rate: Optional[float] = Field(default=None, ge=0.1, le=1.0)
    pitch: Optional[float] = Field(default=None, ge=0.5, le=2.0)
    wake_word_enabled: Optional[bool] = None
    wake_word: Optional[str] = None
    haptics: Optional[bool] = None
    auto_speak_replies: Optional[bool] = None
    confirm_calls: Optional[bool] = None
    confirm_messages: Optional[bool] = None
    save_history: Optional[bool] = None
    personalised_memory: Optional[bool] = None
    analytics: Optional[bool] = None
    theme: Optional[str] = None
