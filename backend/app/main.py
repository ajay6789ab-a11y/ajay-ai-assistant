"""
Ajay AI Assistant — FastAPI application entry point.

Run locally:
    cd backend && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

Interactive API docs: http://localhost:8000/docs
Web demo (the Flutter UI mirrored in HTML): http://localhost:8000/
"""

from __future__ import annotations

import logging
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .config import settings
from .database import init_db
from .routers import (
    assistant,
    auth,
    history,
    memory,
    notes,
    reminders,
    settings_router,
    tasks,
    tools,
)

logging.basicConfig(
    level=logging.INFO if not settings.DEBUG else logging.DEBUG,
    format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
)
for noisy in ("httpx", "httpcore", "urllib3"):
    logging.getLogger(noisy).setLevel(logging.WARNING)   # keep our logs readable

log = logging.getLogger("ajay")

STATIC_DIR = Path(__file__).parent / "static"


@asynccontextmanager
async def lifespan(_: FastAPI):
    """Startup/shutdown hooks."""
    init_db()
    log.info("Database ready at %s", settings.DB_PATH)
    log.info("AI engine: %s", f"LLM ({settings.AI_MODEL})" if settings.ai_enabled
             else "offline rule-engine (set OPENAI_API_KEY to enable GPT)")
    yield
    log.info("Shutting down Ajay AI Assistant")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.VERSION,
    description=(
        "Backend brain for the **Ajay AI Assistant** Android app: bilingual "
        "(Hindi/English) intent understanding, GPT integration, phone-action "
        "contracts, memory, planner, notes and smart tools."
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def timing_and_security_headers(request: Request, call_next):
    """Adds latency telemetry + baseline security headers to every response."""
    started = time.perf_counter()
    response = await call_next(request)
    response.headers["X-Response-Time-ms"] = f"{(time.perf_counter() - started) * 1000:.1f}"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    # Clickjacking protection is enabled outside development only, because the
    # in-workspace live preview embeds the demo UI in a cross-origin iframe.
    if not settings.DEBUG:
        response.headers["X-Frame-Options"] = "SAMEORIGIN"
    return response


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Never leak stack traces to the phone."""
    log.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "Something went wrong on our side. Please try again."},
    )


# ---- Routes ---------------------------------------------------------------
app.include_router(auth.router)
app.include_router(assistant.router)
app.include_router(history.router)
app.include_router(tasks.router)
app.include_router(reminders.router)
app.include_router(notes.router)
app.include_router(memory.router)
app.include_router(settings_router.router)
app.include_router(tools.router)


@app.get("/api/health", tags=["system"])
def health() -> dict[str, Any]:
    """Liveness probe + capability report (the app shows this in Settings)."""
    return {
        "status": "ok",
        "app": settings.APP_NAME,
        "version": settings.VERSION,
        "ai_engine": "llm" if settings.ai_enabled else "rules",
        "model": settings.AI_MODEL if settings.ai_enabled else None,
        "features": {
            "voice": True, "hindi": True, "english": True, "memory": True,
            "planner": True, "weather": True, "news": True, "translate": True,
            "calculator": True, "phone_control": True,
        },
    }


# ---- Web demo (mirrors the Flutter UI so the stack is testable in a browser)
if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

    @app.get("/", include_in_schema=False)
    def demo_index() -> FileResponse:
        return FileResponse(STATIC_DIR / "index.html")

    @app.get("/manifest.webmanifest", include_in_schema=False)
    def manifest() -> FileResponse:
        return FileResponse(STATIC_DIR / "manifest.webmanifest")
