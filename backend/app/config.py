"""
Application configuration for Ajay AI Assistant backend.

Reads settings from environment variables (and an optional `.env` file that
sits next to the `backend/` folder).  No third-party settings library is used
so the service boots with a minimal dependency footprint.
"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent          # .../backend
PROJECT_ROOT = BASE_DIR.parent                             # repository root


def _load_dotenv() -> None:
    """Very small .env parser (KEY=VALUE, `#` comments, no interpolation)."""
    for candidate in (BASE_DIR / ".env", PROJECT_ROOT / ".env"):
        if not candidate.exists():
            continue
        for raw in candidate.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key, value = key.strip(), value.strip().strip('"').strip("'")
            # Real environment variables always win over the .env file.
            os.environ.setdefault(key, value)


_load_dotenv()


def _bool(name: str, default: bool = False) -> bool:
    return os.getenv(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


class Settings:
    """Immutable-ish settings object shared through `get_settings()`."""

    # ---- Service ---------------------------------------------------------
    APP_NAME: str = "Ajay AI Assistant API"
    VERSION: str = "1.0.0"
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))
    DEBUG: bool = _bool("DEBUG", True)

    # ---- Storage ---------------------------------------------------------
    # SQLite by default (zero-config MVP).  Firebase can be enabled later via
    # FIREBASE_CREDENTIALS; see docs/ARCHITECTURE.md.
    DB_PATH: str = os.getenv("DB_PATH", str(BASE_DIR / "data" / "ajay.db"))
    FIREBASE_CREDENTIALS: str | None = os.getenv("FIREBASE_CREDENTIALS") or None

    # ---- Security --------------------------------------------------------
    JWT_SECRET: str = os.getenv("JWT_SECRET", "dev-secret-change-me-in-production")
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_TTL_MIN: int = int(os.getenv("ACCESS_TOKEN_TTL_MIN", str(60 * 24 * 30)))
    CORS_ORIGINS: list[str] = [
        o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip()
    ]

    # ---- AI provider (OpenAI-compatible: OpenAI, Azure, Groq, OpenRouter…) -
    AI_API_KEY: str | None = os.getenv("OPENAI_API_KEY") or os.getenv("AI_API_KEY") or None
    AI_BASE_URL: str = os.getenv("AI_BASE_URL", "https://api.openai.com/v1")
    AI_MODEL: str = os.getenv("AI_MODEL", "gpt-4o-mini")
    AI_TIMEOUT_S: float = float(os.getenv("AI_TIMEOUT_S", "20"))
    AI_MAX_HISTORY: int = int(os.getenv("AI_MAX_HISTORY", "12"))

    # ---- Third-party tools ----------------------------------------------
    # Weather uses Open-Meteo (no API key required).
    WEATHER_GEO_URL: str = "https://geocoding-api.open-meteo.com/v1/search"
    WEATHER_URL: str = "https://api.open-meteo.com/v1/forecast"
    # News uses Google News RSS (no API key required).
    NEWS_RSS_URL: str = "https://news.google.com/rss/search"
    # Translation uses the free MyMemory endpoint with an offline fallback.
    TRANSLATE_URL: str = "https://api.mymemory.translated.net/get"
    HTTP_TIMEOUT_S: float = float(os.getenv("HTTP_TIMEOUT_S", "12"))

    @property
    def ai_enabled(self) -> bool:
        """True when a real LLM key is configured (otherwise offline brain)."""
        return bool(self.AI_API_KEY)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
