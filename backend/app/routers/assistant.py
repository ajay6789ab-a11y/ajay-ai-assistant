"""Assistant routes: the single endpoint the phone talks to for every turn."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query

from ..ai import brain, memory as memory_store, nlu
from ..database import execute, get_settings_for, query
from ..schemas import ChatIn, ChatOut
from ..security import current_user

router = APIRouter(prefix="/api/assistant", tags=["assistant"])


@router.post("/chat", response_model=ChatOut)
async def chat(body: ChatIn, user: dict[str, Any] = Depends(current_user)) -> ChatOut:
    """Understand an utterance, run tools, persist history, return an action."""
    result = await brain.think(
        user=user,
        text=body.text,
        source=body.source,
        language_hint=body.language,
        client_time=body.client_time,
        location=body.location,
        user_settings=get_settings_for(user["id"]),
    )
    return ChatOut(**result)


@router.post("/intent")
def parse_intent(body: ChatIn, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    """
    Rules-only parse with no side effects.

    The Flutter app calls this for *offline mode* and for previewing what a
    command will do before the user confirms it.
    """
    intent = nlu.parse(body.text)
    return {
        "intent": intent.name,
        "confidence": intent.confidence,
        "language": intent.language,
        "entities": intent.entities,
        "action": {
            "type": intent.action_type,
            "params": intent.params,
            "requires_confirmation": intent.requires_confirmation,
        },
        "reply": intent.reply(),
    }


@router.get("/conversation")
def conversation(
    limit: int = Query(50, ge=1, le=500),
    user: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    """Full chat transcript, oldest → newest (chat screen restore)."""
    rows = query(
        "SELECT id, role, content, intent, action, language, created_at FROM messages "
        "WHERE user_id=? AND role IN ('user','assistant') ORDER BY created_at DESC, rowid DESC LIMIT ?",
        (user["id"], limit),
    )
    return {"messages": list(reversed(rows))}


@router.delete("/conversation")
def clear_conversation(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    deleted = execute("DELETE FROM messages WHERE user_id=?", (user["id"],))
    return {"deleted": deleted}


@router.get("/suggestions")
def suggestions(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    """
    Quick-action chips for the home screen.

    Starts with sensible defaults, then promotes whatever the user actually
    uses most (implicit memory).
    """
    base = [
        {"label": "Weather", "icon": "cloud", "command": "What's the weather today?"},
        {"label": "News", "icon": "newspaper", "command": "Search cricket news"},
        {"label": "Alarm", "icon": "alarm", "command": "Set alarm for 7 AM"},
        {"label": "Camera", "icon": "camera", "command": "Open camera"},
        {"label": "My photos", "icon": "photo", "command": "Find my photos"},
        {"label": "Planner", "icon": "planner", "command": "Show my plan for today"},
    ]
    for app in memory_store.top_usage(user["id"], "app", 2):
        base.insert(0, {"label": app["name"].title(), "icon": "app",
                        "command": f"Open {app['name']}"})
    for contact in memory_store.top_usage(user["id"], "contact", 1):
        base.insert(0, {"label": f"Call {contact['name']}", "icon": "call",
                        "command": f"Call {contact['name']}"})
    return {"suggestions": base[:8]}
