"""System prompts used when a GPT-compatible model is configured."""

from __future__ import annotations

SYSTEM_PROMPT = """You are **Ajay**, a warm, quick, highly capable personal AI \
assistant living inside an Android phone in India.

STYLE
- Reply in the SAME language the user used. Hindi -> natural Hindi (Devanagari),
  Hinglish -> friendly Hinglish, English -> English. Never mix scripts randomly.
- Be concise: 1-2 sentences, because your reply is spoken aloud by TTS.
- Never use markdown, emoji spam, bullet lists or code blocks in spoken replies.
- Be warm and human, never robotic. Use the user's name when you know it.

CAPABILITIES (the phone executes these for you)
CALL, SMS, WHATSAPP, OPEN_APP, OPEN_URL, WEB_SEARCH, YOUTUBE_SEARCH, SET_ALARM,
SET_TIMER, OPEN_CAMERA, OPEN_GALLERY, OPEN_FILES, OPEN_SETTINGS,
CREATE_REMINDER, CREATE_TASK, CREATE_NOTE, SHOW_PLANNER, SHOW_WEATHER,
SHOW_NEWS, TRANSLATE, CALCULATE, NAVIGATE, PLAY_MUSIC, TOGGLE_FLASHLIGHT,
BATTERY_STATUS, SPEAK_ONLY.

RULES
- Calls and messages always need the user's confirmation first; say what you are
  about to do and ask for a yes.
- If a request is ambiguous (which Rahul? what time?), ask ONE short question.
- Use the supplied MEMORY facts to personalise, but never invent memories.
- If you do not know something factual and cannot look it up, say so briefly.
"""

# Function/tool schema handed to the model so it can emit a structured action.
ACTION_TOOL = {
    "type": "function",
    "function": {
        "name": "perform_action",
        "description": (
            "Execute an action on the user's Android phone and give a short "
            "spoken reply. Always call this exactly once per user turn."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "reply": {
                    "type": "string",
                    "description": "Short spoken reply in the user's language.",
                },
                "intent": {
                    "type": "string",
                    "description": "Short snake_case label, e.g. call, open_app, chat.",
                },
                "action_type": {
                    "type": "string",
                    "enum": [
                        "CALL", "SMS", "WHATSAPP", "OPEN_APP", "OPEN_URL",
                        "WEB_SEARCH", "YOUTUBE_SEARCH", "SET_ALARM", "SET_TIMER",
                        "OPEN_CAMERA", "OPEN_GALLERY", "OPEN_FILES",
                        "OPEN_SETTINGS", "CREATE_REMINDER", "CREATE_TASK",
                        "CREATE_NOTE", "SHOW_PLANNER", "SHOW_WEATHER",
                        "SHOW_NEWS", "TRANSLATE", "CALCULATE", "NAVIGATE",
                        "PLAY_MUSIC", "TOGGLE_FLASHLIGHT", "BATTERY_STATUS",
                        "SPEAK_ONLY",
                    ],
                },
                "params": {
                    "type": "object",
                    "description": (
                        "Action arguments, e.g. {'contact':'Rahul'}, "
                        "{'app':'youtube'}, {'hour':7,'minute':0}, "
                        "{'query':'cricket news'}, {'city':'Delhi'}."
                    ),
                    "additionalProperties": True,
                },
                "memory_write": {
                    "type": "object",
                    "description": (
                        "Optional durable fact worth remembering about the user, "
                        "e.g. {'key':'favourite_city','value':'Jaipur'}."
                    ),
                    "properties": {
                        "key": {"type": "string"},
                        "value": {"type": "string"},
                    },
                },
            },
            "required": ["reply", "intent", "action_type"],
        },
    },
}


def build_context_block(*, user_name: str, local_time: str, memories: list[str],
                        language_pref: str, city: str | None) -> str:
    """Compact context injected as a system message on every request."""
    mem = "\n".join(f"- {m}" for m in memories[:15]) or "- (nothing yet)"
    return (
        f"CONTEXT\nUser name: {user_name}\nLocal time: {local_time}\n"
        f"Default city: {city or 'unknown'}\nPreferred language setting: {language_pref}\n"
        f"MEMORY ABOUT USER:\n{mem}"
    )
