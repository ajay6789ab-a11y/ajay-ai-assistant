"""
SQLite persistence layer.

The MVP intentionally uses the Python standard-library `sqlite3` driver:
 * zero external dependencies,
 * a single portable file (`backend/data/ajay.db`),
 * mirrors the on-device schema used by the Flutter app (sqflite) so the two
   can be synchronised field-for-field.

Every table carries a `user_id` column so the same database can serve many
devices/accounts.
"""

from __future__ import annotations

import json
import sqlite3
import threading
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

from .config import settings

_LOCK = threading.Lock()

SCHEMA = """
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

-- Accounts (email/password or anonymous device guests) --------------------
CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    email         TEXT UNIQUE,
    name          TEXT NOT NULL DEFAULT 'Friend',
    password_hash TEXT,
    device_id     TEXT,
    is_guest      INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL
);

-- Full conversation transcript (chat screen) ------------------------------
CREATE TABLE IF NOT EXISTS messages (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role       TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content    TEXT NOT NULL,
    intent     TEXT,
    action     TEXT,                    -- JSON blob of the resolved action
    language   TEXT DEFAULT 'en',
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id, created_at DESC);

-- Command history (history screen) ----------------------------------------
CREATE TABLE IF NOT EXISTS history (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    command     TEXT NOT NULL,
    reply       TEXT,
    intent      TEXT,
    action_type TEXT,
    confidence  REAL DEFAULT 0,
    source      TEXT DEFAULT 'voice',   -- voice | text | quick_action
    success     INTEGER DEFAULT 1,
    created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_history_user ON history(user_id, created_at DESC);

-- Long-term memory / user preferences -------------------------------------
CREATE TABLE IF NOT EXISTS memory (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key        TEXT NOT NULL,
    value      TEXT NOT NULL,
    kind       TEXT DEFAULT 'preference',  -- preference | fact | contact | habit
    weight     REAL DEFAULT 1.0,
    updated_at TEXT NOT NULL,
    UNIQUE(user_id, key)
);

-- To-do / daily planner ----------------------------------------------------
CREATE TABLE IF NOT EXISTS tasks (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title      TEXT NOT NULL,
    notes      TEXT,
    due_at     TEXT,
    priority   INTEGER DEFAULT 1,       -- 0 low, 1 normal, 2 high
    done       INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id, done, due_at);

-- Calendar reminders / alarms ---------------------------------------------
CREATE TABLE IF NOT EXISTS reminders (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title      TEXT NOT NULL,
    remind_at  TEXT NOT NULL,
    repeat     TEXT DEFAULT 'none',     -- none | daily | weekly
    fired      INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reminders_user ON reminders(user_id, remind_at);

-- Text + voice notes -------------------------------------------------------
CREATE TABLE IF NOT EXISTS notes (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title      TEXT,
    body       TEXT NOT NULL,
    audio_path TEXT,                    -- set for voice notes
    pinned     INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notes_user ON notes(user_id, created_at DESC);

-- Per-user app settings (voice, language, privacy) -------------------------
CREATE TABLE IF NOT EXISTS settings (
    user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    payload    TEXT NOT NULL,           -- JSON blob
    updated_at TEXT NOT NULL
);
"""

DEFAULT_SETTINGS: dict[str, Any] = {
    "language": "auto",          # auto | en-IN | hi-IN
    "voice": "female_warm",      # female_warm | male_deep | female_bright | male_calm
    "speech_rate": 0.48,
    "pitch": 1.0,
    "wake_word_enabled": False,
    "wake_word": "hey ajay",
    "haptics": True,
    "auto_speak_replies": True,
    "confirm_calls": True,       # security: always confirm before dialling
    "confirm_messages": True,
    "save_history": True,
    "personalised_memory": True,
    "analytics": False,
    "theme": "midnight",         # midnight | nebula | carbon
}


def utcnow() -> str:
    """ISO-8601 UTC timestamp used across every table."""
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def new_id() -> str:
    return uuid.uuid4().hex


def _connect() -> sqlite3.Connection:
    Path(settings.DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(settings.DB_PATH, check_same_thread=False, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


@contextmanager
def db() -> Iterator[sqlite3.Connection]:
    """Thread-safe connection context manager with commit/rollback handling."""
    with _LOCK:
        conn = _connect()
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()


def init_db() -> None:
    """Create tables on startup (idempotent)."""
    with db() as conn:
        conn.executescript(SCHEMA)


# --------------------------------------------------------------------------
# Small query helpers keep the routers free of SQL boilerplate.
# --------------------------------------------------------------------------
def query(sql: str, params: tuple = ()) -> list[dict[str, Any]]:
    with db() as conn:
        return [dict(r) for r in conn.execute(sql, params).fetchall()]


def query_one(sql: str, params: tuple = ()) -> dict[str, Any] | None:
    rows = query(sql, params)
    return rows[0] if rows else None


def execute(sql: str, params: tuple = ()) -> int:
    with db() as conn:
        cur = conn.execute(sql, params)
        return cur.rowcount


def get_settings_for(user_id: str) -> dict[str, Any]:
    """Return the user's settings merged over the defaults."""
    row = query_one("SELECT payload FROM settings WHERE user_id=?", (user_id,))
    merged = dict(DEFAULT_SETTINGS)
    if row:
        try:
            merged.update(json.loads(row["payload"]))
        except json.JSONDecodeError:
            pass
    return merged


def save_settings_for(user_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    merged = get_settings_for(user_id)
    merged.update({k: v for k, v in payload.items() if k in DEFAULT_SETTINGS})
    execute(
        "INSERT INTO settings(user_id, payload, updated_at) VALUES(?,?,?) "
        "ON CONFLICT(user_id) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at",
        (user_id, json.dumps(merged), utcnow()),
    )
    return merged
