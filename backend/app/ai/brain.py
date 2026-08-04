"""
The AI brain: decides *what the assistant does* for a given utterance.

Strategy (hybrid, deliberately resilient)
-----------------------------------------
1. Run the deterministic bilingual rule engine (`nlu.parse`) — instant, free.
2. If it matched a device command with high confidence, that wins.  Phone
   control must never depend on a network round-trip.
3. Otherwise (chit-chat, questions, ambiguous phrasing) ask the configured
   GPT-compatible model with tool-calling so it can still return a structured
   action.  If no key is configured, or the call fails/times out, we degrade
   gracefully to a friendly rule-based answer.
4. Tool intents (weather / news / translate / calculator) are executed
   server-side and their result is merged into the spoken reply.
5. Conversation turns, command history and learned memories are persisted.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any

import httpx

from ..config import settings
from ..database import execute, new_id, query, utcnow
from ..services import calculator, news as news_service, translate as translate_service, weather as weather_service
from . import memory as memory_store
from . import nlu
from .prompts import ACTION_TOOL, SYSTEM_PROMPT, build_context_block

log = logging.getLogger("ajay.brain")

# Rule confidence at/above which we skip the LLM entirely.
RULE_TRUST_THRESHOLD = 0.80


# --------------------------------------------------------------------------
# Conversation persistence
# --------------------------------------------------------------------------
def save_message(user_id: str, role: str, content: str, *, intent: str | None = None,
                 action: dict[str, Any] | None = None, language: str = "en") -> str:
    mid = new_id()
    execute(
        "INSERT INTO messages(id, user_id, role, content, intent, action, language, created_at) "
        "VALUES(?,?,?,?,?,?,?,?)",
        (mid, user_id, role, content, intent, json.dumps(action) if action else None, language, utcnow()),
    )
    return mid


def recent_messages(user_id: str, limit: int | None = None) -> list[dict[str, Any]]:
    limit = limit or settings.AI_MAX_HISTORY
    rows = query(
        "SELECT role, content FROM messages WHERE user_id=? AND role IN ('user','assistant') "
        "ORDER BY created_at DESC, rowid DESC LIMIT ?",
        (user_id, limit),
    )
    return list(reversed(rows))


def log_history(user_id: str, command: str, reply: str, intent: str, action_type: str,
                confidence: float, source: str, success: bool = True) -> None:
    execute(
        "INSERT INTO history(id, user_id, command, reply, intent, action_type, confidence, "
        "source, success, created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
        (new_id(), user_id, command, reply, intent, action_type, confidence, source,
         int(success), utcnow()),
    )


# --------------------------------------------------------------------------
# LLM call (OpenAI-compatible /chat/completions with tool calling)
# --------------------------------------------------------------------------
async def _ask_llm(user_id: str, text: str, context_block: str) -> dict[str, Any] | None:
    if not settings.ai_enabled:
        return None

    messages: list[dict[str, Any]] = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "system", "content": context_block},
    ]
    messages += [{"role": m["role"], "content": m["content"]} for m in recent_messages(user_id)]
    messages.append({"role": "user", "content": text})

    payload = {
        "model": settings.AI_MODEL,
        "messages": messages,
        "tools": [ACTION_TOOL],
        "tool_choice": {"type": "function", "function": {"name": "perform_action"}},
        "temperature": 0.6,
        "max_tokens": 400,
    }
    headers = {"Authorization": f"Bearer {settings.AI_API_KEY}", "Content-Type": "application/json"}

    try:
        async with httpx.AsyncClient(timeout=settings.AI_TIMEOUT_S) as client:
            r = await client.post(f"{settings.AI_BASE_URL.rstrip('/')}/chat/completions",
                                  json=payload, headers=headers)
            r.raise_for_status()
            data = r.json()

        choice = (data.get("choices") or [{}])[0].get("message", {})
        calls = choice.get("tool_calls") or []
        if calls:
            args = json.loads(calls[0]["function"]["arguments"] or "{}")
            return {
                "reply": (args.get("reply") or "").strip(),
                "intent": args.get("intent") or "chat",
                "action_type": args.get("action_type") or nlu.ActionType.SPEAK_ONLY,
                "params": args.get("params") or {},
                "memory_write": args.get("memory_write") or None,
            }
        # Model answered in plain prose instead of calling the tool.
        content = (choice.get("content") or "").strip()
        if content:
            return {"reply": content, "intent": "chat",
                    "action_type": nlu.ActionType.SPEAK_ONLY, "params": {}}
    except Exception as exc:  # noqa: BLE001 - never break the assistant on API issues
        log.warning("LLM call failed: %s: %s", type(exc).__name__, exc)
    return None


# --------------------------------------------------------------------------
# Server-side tools
# --------------------------------------------------------------------------
async def _run_tool(tool: str, params: dict[str, Any], language: str) -> dict[str, Any]:
    if tool == "weather":
        return await weather_service.get_weather(params.get("city") or "Delhi", language)
    if tool == "news":
        return await news_service.get_news(params.get("topic") or "top", language)
    if tool == "translate":
        return await translate_service.translate(
            params.get("text", ""), params.get("target", "hi"), params.get("source"))
    if tool == "calculator":
        return calculator.calculate(params.get("expression", ""))
    return {"ok": False, "error": f"Unknown tool {tool}"}


_TOOL_FOR_ACTION = {
    nlu.ActionType.SHOW_WEATHER: "weather",
    nlu.ActionType.SHOW_NEWS: "news",
    nlu.ActionType.TRANSLATE: "translate",
    nlu.ActionType.CALCULATE: "calculator",
}


# --------------------------------------------------------------------------
# Public entry point
# --------------------------------------------------------------------------
async def think(
    *,
    user: dict[str, Any],
    text: str,
    source: str = "text",
    language_hint: str | None = None,
    client_time: str | None = None,
    location: str | None = None,
    user_settings: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Process one user turn and return the full ChatOut payload."""
    user_id = user["id"]
    user_settings = user_settings or {}
    now = datetime.now()
    if client_time:
        try:
            now = datetime.fromisoformat(client_time.replace("Z", "+00:00")).replace(tzinfo=None)
        except ValueError:
            pass

    remembered_city = (memory_store.recall_one(user_id, "city") or {}).get("value")
    default_city = location or remembered_city or "Delhi"

    # 1) Deterministic pass -------------------------------------------------
    intent = nlu.parse(text, now=now, default_city=default_city)
    if language_hint in {"hi", "en"}:
        intent.language = language_hint
    elif user_settings.get("language") in {"hi-IN", "en-IN"}:
        # An explicit app-level language preference overrides auto-detection
        # only when the utterance itself is ambiguous (script-free).
        if not nlu.DEVANAGARI.search(text):
            intent.language = user_settings["language"][:2]

    engine = "rules"
    action_type = intent.action_type
    params = dict(intent.params)
    reply = intent.reply()
    intent_name = intent.name
    confidence = intent.confidence
    data: dict[str, Any] = {}

    # 2) LLM pass for anything the rules were unsure about ------------------
    if confidence < RULE_TRUST_THRESHOLD:
        context = build_context_block(
            user_name=user.get("name") or "Friend",
            local_time=now.strftime("%A %d %B %Y, %I:%M %p"),
            memories=memory_store.as_sentences(user_id) if user_settings.get("personalised_memory", True) else [],
            language_pref=user_settings.get("language", "auto"),
            city=default_city,
        )
        llm = await _ask_llm(user_id, text, context)
        if llm and llm.get("reply"):
            engine = "llm"
            reply = llm["reply"]
            intent_name = llm["intent"]
            action_type = llm["action_type"]
            params = llm.get("params") or {}
            confidence = max(confidence, 0.86)
            if llm.get("memory_write"):
                mw = llm["memory_write"]
                if mw.get("key") and mw.get("value"):
                    memory_store.remember(user_id, mw["key"], mw["value"], kind="fact")
        elif intent_name == "chat":
            # Offline conversational fallback, still bilingual and useful.
            reply = _offline_smalltalk(text, intent.language, user.get("name") or "Friend")

    # 3) Tools --------------------------------------------------------------
    tool = intent.needs_tool or _TOOL_FOR_ACTION.get(action_type)
    if tool:
        if tool == "weather":
            params.setdefault("city", default_city)
        result = await _run_tool(tool, params, intent.language)
        data[tool] = result
        if result.get("ok") and result.get("spoken"):
            reply = result["spoken"]
        elif result.get("error"):
            reply = result["error"]

    # 4) Memory -------------------------------------------------------------
    if user_settings.get("personalised_memory", True):
        memory_store.auto_learn(user_id, text)
        if action_type == nlu.ActionType.OPEN_APP and params.get("app"):
            memory_store.track_usage(user_id, "app", str(params["app"]))
        if action_type in {nlu.ActionType.CALL, nlu.ActionType.SMS, nlu.ActionType.WHATSAPP} and params.get("contact"):
            memory_store.track_usage(user_id, "contact", str(params["contact"]))

    # 5) Persist side effects the server owns (tasks/notes/reminders) -------
    _persist_side_effects(user_id, action_type, params)

    # 6) Build the action contract -----------------------------------------
    action = {
        "type": action_type,
        "params": params,
        "requires_confirmation": _needs_confirmation(action_type, user_settings),
        "confirmation_prompt": _confirmation_prompt(action_type, params, intent.language),
        "android_intent": params.get("intent"),
        "url": params.get("url"),
    }

    # 7) Persist the conversation ------------------------------------------
    save_message(user_id, "user", text, intent=intent_name, language=intent.language)
    mid = save_message(user_id, "assistant", reply, intent=intent_name, action=action,
                       language=intent.language)
    if user_settings.get("save_history", True):
        log_history(user_id, text, reply, intent_name, action_type, confidence, source)

    return {
        "reply": reply,
        "intent": intent_name,
        "confidence": round(float(confidence), 2),
        "language": intent.language,
        "action": action,
        "speak": intent.speak and user_settings.get("auto_speak_replies", True),
        "data": data,
        "message_id": mid,
        "engine": engine,
    }


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------
def _needs_confirmation(action_type: str, user_settings: dict[str, Any]) -> bool:
    """Security: never dial or text anybody without an explicit yes."""
    if action_type == nlu.ActionType.CALL:
        return bool(user_settings.get("confirm_calls", True))
    if action_type in {nlu.ActionType.SMS, nlu.ActionType.WHATSAPP}:
        return bool(user_settings.get("confirm_messages", True))
    return False


def _confirmation_prompt(action_type: str, params: dict[str, Any], lang: str) -> str | None:
    who = params.get("contact") or params.get("number") or ""
    if action_type == nlu.ActionType.CALL:
        return f"{who} को कॉल करूँ?" if lang == "hi" else f"Call {who} now?"
    if action_type in {nlu.ActionType.SMS, nlu.ActionType.WHATSAPP}:
        return f"{who} को यह संदेश भेजूँ?" if lang == "hi" else f"Send this message to {who}?"
    return None


def _persist_side_effects(user_id: str, action_type: str, params: dict[str, Any]) -> None:
    """Reminders/tasks/notes created by voice are stored immediately."""
    if action_type == nlu.ActionType.CREATE_TASK and params.get("title"):
        execute(
            "INSERT INTO tasks(id, user_id, title, notes, due_at, priority, done, created_at) "
            "VALUES(?,?,?,?,?,?,0,?)",
            (new_id(), user_id, params["title"], params.get("notes"), params.get("due_at"),
             int(params.get("priority", 1)), utcnow()),
        )
    elif action_type == nlu.ActionType.CREATE_REMINDER and params.get("title"):
        execute(
            "INSERT INTO reminders(id, user_id, title, remind_at, repeat, fired, created_at) "
            "VALUES(?,?,?,?,?,0,?)",
            (new_id(), user_id, params["title"], params.get("remind_at") or utcnow(),
             params.get("repeat", "none"), utcnow()),
        )
    elif action_type == nlu.ActionType.CREATE_NOTE and params.get("body"):
        execute(
            "INSERT INTO notes(id, user_id, title, body, audio_path, pinned, created_at) "
            "VALUES(?,?,?,?,?,0,?)",
            (new_id(), user_id, params.get("title"), params["body"], params.get("audio_path"), utcnow()),
        )


def _offline_smalltalk(text: str, lang: str, name: str) -> str:
    """A decent answer when there is no LLM key and no rule matched."""
    t = text.lower()
    if any(w in t for w in ("joke", "chutkula", "मज़ाक", "चुटकुला")):
        return ("एक कंप्यूटर ठंड में क्यों बैठा था? क्योंकि उसने अपनी Windows खुली छोड़ दी थीं!"
                if lang == "hi" else
                "Why did the computer catch a cold? It left its Windows open!")
    if any(w in t for w in ("how are you", "kaise ho", "कैसे हो", "कैसे हैं")):
        return ("मैं बिल्कुल ठीक हूँ, शुक्रिया! आप बताइए।" if lang == "hi"
                else "I'm running great, thanks for asking! How are you?")
    return (
        f"{name}, मैं अभी ऑफ़लाइन मोड में हूँ, इसलिए मुझे यह पूरी तरह समझ नहीं आया। "
        "आप कह सकते हैं: कॉल करो, मैसेज भेजो, ऐप खोलो, अलार्म लगाओ, मौसम बताओ।"
        if lang == "hi" else
        f"{name}, I'm in offline mode so I didn't fully catch that. Try: call someone, "
        "send a message, open an app, set an alarm, or ask for the weather."
    )
