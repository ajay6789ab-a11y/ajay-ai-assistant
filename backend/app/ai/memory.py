"""
Long-term memory system.

Two layers:
 1. **Explicit memory** - key/value facts the user (or the LLM) chooses to save,
    e.g. `favourite_city = Jaipur`, `wake_time = 06:30`.
 2. **Implicit memory** - lightweight learning from usage: which contacts and
    apps the user touches most, so "call mom" or "open yt" resolve faster and
    the home screen can surface personalised quick actions.

Everything is scoped per user and can be wiped from Settings → Privacy.
"""

from __future__ import annotations

import json
import re
from typing import Any

from ..database import execute, new_id, query, query_one, utcnow

# Facts we auto-extract from natural speech, e.g. "my name is Ajay",
# "मेरा नाम अजय है", "I live in Pune", "remember I like cricket".
_AUTO_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("name", re.compile(r"\b(?:my name is|i am|i'm|mera naam|मेरा नाम)\s+([A-Za-z\u0900-\u097F ]{2,30})", re.I)),
    ("city", re.compile(r"\b(?:i live in|i am from|main rehta hoon|मैं रहता हूँ|मैं रहती हूँ)\s+([A-Za-z\u0900-\u097F ]{2,30})", re.I)),
    ("likes", re.compile(r"\b(?:i like|i love|mujhe pasand hai|मुझे पसंद है)\s+([A-Za-z\u0900-\u097F ,]{2,60})", re.I)),
    ("wake_time", re.compile(r"\b(?:i wake up at|wake me at|मैं उठता हूँ)\s+([\d: apm\.]{2,10})", re.I)),
]


def remember(user_id: str, key: str, value: str, kind: str = "preference", weight: float = 1.0) -> dict[str, Any]:
    """Insert or update a memory row (unique per user+key)."""
    key = key.strip().lower().replace(" ", "_")[:80]
    execute(
        "INSERT INTO memory(id, user_id, key, value, kind, weight, updated_at) "
        "VALUES(?,?,?,?,?,?,?) "
        "ON CONFLICT(user_id, key) DO UPDATE SET value=excluded.value, "
        "kind=excluded.kind, weight=memory.weight+0.5, updated_at=excluded.updated_at",
        (new_id(), user_id, key, str(value)[:1000], kind, weight, utcnow()),
    )
    return recall_one(user_id, key) or {}


def recall_one(user_id: str, key: str) -> dict[str, Any] | None:
    return query_one("SELECT * FROM memory WHERE user_id=? AND key=?", (user_id, key.lower()))


def recall_all(user_id: str, limit: int = 50) -> list[dict[str, Any]]:
    return query(
        "SELECT key, value, kind, weight, updated_at FROM memory WHERE user_id=? "
        "ORDER BY weight DESC, updated_at DESC LIMIT ?",
        (user_id, limit),
    )


def forget(user_id: str, key: str) -> int:
    return execute("DELETE FROM memory WHERE user_id=? AND key=?", (user_id, key.lower()))


def forget_all(user_id: str) -> int:
    return execute("DELETE FROM memory WHERE user_id=?", (user_id,))


def as_sentences(user_id: str, limit: int = 15) -> list[str]:
    """Memories rendered for the LLM context block."""
    return [f"{m['key'].replace('_', ' ')}: {m['value']}" for m in recall_all(user_id, limit)]


def auto_learn(user_id: str, text: str) -> list[str]:
    """Scan an utterance for durable facts and store them. Returns keys saved."""
    saved: list[str] = []
    for key, pattern in _AUTO_PATTERNS:
        m = pattern.search(text)
        if m:
            value = m.group(1).strip(" .,!")
            if value:
                remember(user_id, key, value, kind="fact", weight=2.0)
                saved.append(key)
    return saved


def track_usage(user_id: str, kind: str, value: str) -> None:
    """
    Implicit learning: bump a counter for a contact/app the user just used.

    Stored as `usage:app:youtube -> {"count": 7}` so it never collides with
    user-visible preferences.
    """
    if not value:
        return
    key = f"usage:{kind}:{value.strip().lower()}"
    row = recall_one(user_id, key)
    count = 1
    if row:
        try:
            count = int(json.loads(row["value"]).get("count", 0)) + 1
        except (json.JSONDecodeError, ValueError, TypeError):
            count = 1
    remember(user_id, key, json.dumps({"count": count}), kind="habit", weight=float(count))


def top_usage(user_id: str, kind: str, limit: int = 5) -> list[dict[str, Any]]:
    """Most-used apps/contacts, used for personalised quick actions."""
    rows = query(
        "SELECT key, value, weight FROM memory WHERE user_id=? AND key LIKE ? "
        "ORDER BY weight DESC LIMIT ?",
        (user_id, f"usage:{kind}:%", limit),
    )
    out = []
    for r in rows:
        label = r["key"].split(":", 2)[-1]
        try:
            count = int(json.loads(r["value"]).get("count", 1))
        except Exception:  # noqa: BLE001 - defensive, memory is user-writable
            count = 1
        out.append({"name": label, "count": count})
    return out
