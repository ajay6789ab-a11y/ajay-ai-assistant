"""Unit tests for the bilingual NLU engine (no network, no DB)."""

from __future__ import annotations

from datetime import datetime, timedelta

import pytest

from app.ai import nlu
from app.ai.nlu import ActionType

NOW = datetime(2026, 8, 4, 10, 30)


@pytest.mark.parametrize(
    "utterance,expected_action,check",
    [
        # ---- English (the exact commands from the product spec) ----------
        ("Call Rahul", ActionType.CALL, lambda p: p["contact"] == "Rahul"),
        ("Send message to Amit", ActionType.SMS, lambda p: p["contact"] == "Amit"),
        ("Open YouTube", ActionType.OPEN_APP, lambda p: p["app"] == "youtube"),
        ("Search cricket news", ActionType.SHOW_NEWS, lambda p: "cricket" in p["topic"]),
        ("Set alarm for 7 AM", ActionType.SET_ALARM, lambda p: p["hour"] == 7),
        ("Open camera", ActionType.OPEN_CAMERA, lambda p: True),
        ("Find my photos", ActionType.OPEN_GALLERY, lambda p: True),
        # ---- More English ------------------------------------------------
        ("Search best laptops 2026", ActionType.WEB_SEARCH, lambda p: "laptops" in p["query"]),
        ("play arijit singh on youtube", ActionType.YOUTUBE_SEARCH, lambda p: "arijit" in p["query"].lower()),
        ("remind me to pay the bill at 6 pm", ActionType.CREATE_REMINDER, lambda p: "Bill" in p["title"] or "bill" in p["title"].lower()),
        ("add task buy milk", ActionType.CREATE_TASK, lambda p: "Milk" in p["title"]),
        ("note down meeting ideas", ActionType.CREATE_NOTE, lambda p: "meeting" in p["body"]),
        ("what's the weather in Mumbai", ActionType.SHOW_WEATHER, lambda p: p["city"] == "Mumbai"),
        ("translate good morning to hindi", ActionType.TRANSLATE, lambda p: p["target"] == "hindi"),
        ("calculate 25 * 4 + 10", ActionType.CALCULATE, lambda p: "25" in p["expression"]),
        ("open wifi settings", ActionType.OPEN_SETTINGS, lambda p: p["page"] == "wifi"),
        ("navigate to India Gate", ActionType.NAVIGATE, lambda p: "India Gate" in p["place"]),
        ("set a timer for 10 minutes", ActionType.SET_TIMER, lambda p: p["seconds"] == 600),
        ("turn on the torch", ActionType.TOGGLE_FLASHLIGHT, lambda p: p["on"] is True),
        # ---- Hindi (Devanagari) ------------------------------------------
        ("राहुल को कॉल करो", ActionType.CALL, lambda p: "राहुल" in p["contact"]),
        ("अमित को मैसेज भेजो", ActionType.SMS, lambda p: "अमित" in p["contact"]),
        ("यूट्यूब खोलो", ActionType.OPEN_APP, lambda p: p["app"] == "youtube"),
        ("कैमरा खोलो", ActionType.OPEN_CAMERA, lambda p: True),
        ("दिल्ली का मौसम बताओ", ActionType.SHOW_WEATHER, lambda p: True),
        ("सुबह 7 बजे अलार्म लगाओ", ActionType.SET_ALARM, lambda p: p["hour"] == 7),
        # ---- Hinglish (roman script) -------------------------------------
        ("Rahul ko call karo", ActionType.CALL, lambda p: p["contact"] == "Rahul"),
        ("youtube kholo", ActionType.OPEN_APP, lambda p: p["app"] == "youtube"),
        ("mausam kaisa hai", ActionType.SHOW_WEATHER, lambda p: True),
        ("cricket news batao", ActionType.SHOW_NEWS, lambda p: True),
    ],
)
def test_intent_actions(utterance: str, expected_action: str, check) -> None:
    intent = nlu.parse(utterance, now=NOW)
    assert intent.action_type == expected_action, f"{utterance!r} -> {intent.action_type}"
    assert check(intent.params), f"{utterance!r} params={intent.params}"
    assert intent.confidence >= 0.6


def test_language_detection() -> None:
    assert nlu.detect_language("Call Rahul") == "en"
    assert nlu.detect_language("राहुल को कॉल करो") == "hi"
    assert nlu.detect_language("Rahul ko call karo") == "hi"      # Hinglish


def test_reply_follows_language() -> None:
    assert "कॉल" in nlu.parse("राहुल को कॉल करो").reply()
    assert "Calling" in nlu.parse("Call Rahul").reply()


def test_sensitive_actions_need_confirmation() -> None:
    assert nlu.parse("Call Rahul").requires_confirmation is True
    assert nlu.parse("Send message to Amit").requires_confirmation is True
    assert nlu.parse("Open YouTube").requires_confirmation is False


@pytest.mark.parametrize(
    "text,hour,minute",
    [
        ("set alarm for 7 am", 7, 0),
        ("set alarm for 7:45 pm", 19, 45),
        ("सुबह 6 बजे अलार्म", 6, 0),
        ("raat 9 baje alarm lagao", 21, 0),
    ],
)
def test_time_parsing(text: str, hour: int, minute: int) -> None:
    when = nlu.parse_time(text, NOW)
    assert when is not None
    assert (when.hour, when.minute) == (hour, minute)


def test_relative_time_parsing() -> None:
    when = nlu.parse_time("remind me in 20 minutes", NOW)
    assert when == NOW.replace(second=0, microsecond=0).replace(minute=50)


def test_unknown_falls_back_to_chat() -> None:
    intent = nlu.parse("what do you think about quantum physics")
    assert intent.name == "chat"
    assert intent.action_type == ActionType.SPEAK_ONLY


def test_app_alias_resolution() -> None:
    key, meta = nlu.match_app("whatsapp")          # type: ignore[misc]
    assert key == "whatsapp" and meta["package"] == "com.whatsapp"


# ---------------------------------------------------------------------------
# Regression: city extraction must respect Hindi vs English word order.
# Hindi puts the place BEFORE the postposition ("दिल्ली का मौसम"), English
# puts it AFTER the preposition ("weather in Delhi"). A naive trailing-match
# regex captured "मौसम बताओ" as the city, so the weather tool 404'd.
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    "text,expected",
    [
        ("दिल्ली का मौसम बताओ", "दिल्ली"),
        ("मुंबई में मौसम कैसा है", "मुंबई"),
        ("कोलकाता मौसम", "कोलकाता"),
        ("Mumbai ka mausam", "Mumbai"),
        ("weather in Delhi", "Delhi"),
        ("temperature in Bangalore", "Bangalore"),
        ("weather in New York", "New York"),
        ("is it raining in Pune", "Pune"),
        ("Delhi ka temperature kya hai", "Delhi"),
    ],
)
def test_weather_city_extraction(text: str, expected: str) -> None:
    assert nlu._extract_city(text) == expected


@pytest.mark.parametrize(
    "text",
    ["आज का मौसम बताओ", "weather today", "what is the weather", "मौसम बताओ", "अभी का मौसम"],
)
def test_weather_without_city_returns_none(text: str) -> None:
    """No place named -> fall back to the user's default city, never a stopword."""
    assert nlu._extract_city(text) is None


def test_weather_intent_uses_extracted_city() -> None:
    intent = nlu.parse("दिल्ली का मौसम बताओ")
    assert intent.action_type == ActionType.SHOW_WEATHER
    assert intent.params["city"] == "दिल्ली"


# ---------------------------------------------------------------------------
# Regression: "add <item> to my todo list" puts the item before the keyword,
# which previously fell through to smalltalk at 0.30 confidence.
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    "text,title",
    [
        ("Add buy milk to my todo list", "buy milk"),
        ("add call bank to my task list", "call bank"),
        ("put pay bills in my todo", "pay bills"),
        ("Add a task: finish report", "finish report"),
        ("दूध लाना मेरी लिस्ट में जोड़ो", "दूध लाना"),
        ("doodh lana todo me add karo", "doodh lana"),
        ("मीटिंग टास्क में जोड़ो", "मीटिंग"),
    ],
)
def test_add_task_word_orders(text: str, title: str) -> None:
    intent = nlu.parse(text)
    assert intent.action_type == ActionType.CREATE_TASK
    assert intent.confidence >= 0.85
    assert intent.entities["title"] == title


# ---------------------------------------------------------------------------
# Regression: Hinglish reminder phrasings. "reminder laga do paani peena" and
# "yaad dilana dawa lena" put the verb at the FRONT, which no rule matched, so
# they fell through to smalltalk at 0.30. The title also had to survive a
# leading relative time ("5 minute baad ... ka") and a trailing case particle
# ("... ka", "... ke liye") without eating the last letter of a word ("papa").
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    "text,title",
    [
        ("reminder laga do paani peena", "paani peena"),
        ("yaad dilana dawa lena", "dawa lena"),
        ("mujhe dawa lene ki yaad dila do", "dawa lene"),
        ("5 minute baad paani peene ka reminder laga do", "paani peene"),
        ("mujhe paani peene ki yaad dilana", "paani peene"),
        ("mujhe yaad dilana meeting ke liye", "meeting"),
        ("mujhe kal subah uthne ka reminder lagao", "subah uthne"),
        ("remind me to call papa", "call papa"),
        ("remind me to call papa at 5pm", "call papa"),
        ("set a reminder to pay rent", "pay rent"),
        ("reminder for the doctor appointment", "doctor appointment"),
        ("remind me to buy an umbrella", "buy an umbrella"),
    ],
)
def test_reminder_word_orders(text: str, title: str) -> None:
    intent = nlu.parse(text)
    assert intent.action_type == ActionType.CREATE_REMINDER
    assert intent.confidence >= 0.85
    assert intent.entities["title"] == title


@pytest.mark.parametrize("text", ["reminder laga do", "reminder lagao", "yaad dilana"])
def test_reminder_without_title_falls_back_to_chat(text: str) -> None:
    """A bare verb with nothing to remind about must not invent a reminder."""
    intent = nlu.parse(text)
    assert intent.name == "chat"
    assert intent.action_type == ActionType.SPEAK_ONLY


def test_reminder_relative_time_is_applied() -> None:
    intent = nlu.parse("5 minute baad paani peene ka reminder laga do", now=NOW)
    assert intent.action_type == ActionType.CREATE_REMINDER
    assert intent.entities["time"] == (NOW + timedelta(minutes=5)).isoformat()
