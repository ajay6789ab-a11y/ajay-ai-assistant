"""
Bilingual (English / Hindi / Hinglish) natural-language understanding engine.

This is the *deterministic* half of the AI brain.  It runs instantly, costs
nothing, works offline and is what keeps the assistant usable when the GPT API
key is absent, rate-limited or the phone is on a bad network.

Pipeline
--------
    raw text -> normalise -> language detect -> intent match (weighted regex)
             -> entity extraction -> Action object + spoken reply

Every intent yields an `Action` whose `type` is a stable contract consumed by
the Flutter client (`lib/services/phone_control_service.dart`).
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any

# --------------------------------------------------------------------------
# Action contract shared with the mobile client
# --------------------------------------------------------------------------
class ActionType:
    CALL = "CALL"
    SMS = "SMS"
    WHATSAPP = "WHATSAPP"
    OPEN_APP = "OPEN_APP"
    OPEN_URL = "OPEN_URL"
    WEB_SEARCH = "WEB_SEARCH"
    YOUTUBE_SEARCH = "YOUTUBE_SEARCH"
    SET_ALARM = "SET_ALARM"
    SET_TIMER = "SET_TIMER"
    OPEN_CAMERA = "OPEN_CAMERA"
    OPEN_GALLERY = "OPEN_GALLERY"
    OPEN_FILES = "OPEN_FILES"
    OPEN_SETTINGS = "OPEN_SETTINGS"
    CREATE_REMINDER = "CREATE_REMINDER"
    CREATE_TASK = "CREATE_TASK"
    CREATE_NOTE = "CREATE_NOTE"
    SHOW_PLANNER = "SHOW_PLANNER"
    SHOW_WEATHER = "SHOW_WEATHER"
    SHOW_NEWS = "SHOW_NEWS"
    TRANSLATE = "TRANSLATE"
    CALCULATE = "CALCULATE"
    NAVIGATE = "NAVIGATE"
    PLAY_MUSIC = "PLAY_MUSIC"
    TOGGLE_FLASHLIGHT = "TOGGLE_FLASHLIGHT"
    BATTERY_STATUS = "BATTERY_STATUS"
    SPEAK_ONLY = "SPEAK_ONLY"


# Actions that touch money, privacy or other people => explicit consent first.
SENSITIVE_ACTIONS = {ActionType.CALL, ActionType.SMS, ActionType.WHATSAPP}


@dataclass
class Intent:
    """Result of a single NLU pass."""

    name: str
    confidence: float
    language: str = "en"
    entities: dict[str, Any] = field(default_factory=dict)
    action_type: str = ActionType.SPEAK_ONLY
    params: dict[str, Any] = field(default_factory=dict)
    reply_en: str = ""
    reply_hi: str = ""
    needs_tool: str | None = None       # weather | news | translate | calculator
    speak: bool = True

    @property
    def requires_confirmation(self) -> bool:
        return self.action_type in SENSITIVE_ACTIONS

    def reply(self) -> str:
        return self.reply_hi if self.language == "hi" and self.reply_hi else self.reply_en


# --------------------------------------------------------------------------
# Normalisation & language detection
# --------------------------------------------------------------------------
DEVANAGARI = re.compile(r"[\u0900-\u097F]")

# Romanised Hindi markers used to detect "Hinglish" input from the keyboard.
HINGLISH_TOKENS = {
    "karo", "karna", "kardo", "kar", "do", "dijiye", "kijiye", "bhejo", "bhej",
    "kholo", "khol", "lagao", "laga", "batao", "bata", "dikhao", "dikha",
    "chalao", "chala", "mujhe", "mera", "meri", "kya", "kaisa", "kaise",
    "kaun", "kab", "kitna", "kitne", "abhi", "aaj", "kal", "subah", "shaam",
    "raat", "baje", "yaad", "dila", "milao", "khoj", "dhoondh", "namaste",
    "shukriya", "dhanyavad", "acha", "theek", "haan", "nahi", "bhai",
}

APP_ALIASES: dict[str, dict[str, str]] = {
    # canonical -> {package, url}
    "youtube":   {"package": "com.google.android.youtube", "url": "https://youtube.com"},
    "whatsapp":  {"package": "com.whatsapp", "url": "https://wa.me"},
    "instagram": {"package": "com.instagram.android", "url": "https://instagram.com"},
    "facebook":  {"package": "com.facebook.katana", "url": "https://facebook.com"},
    "chrome":    {"package": "com.android.chrome", "url": "https://google.com"},
    "gmail":     {"package": "com.google.android.gm", "url": "https://mail.google.com"},
    "maps":      {"package": "com.google.android.apps.maps", "url": "https://maps.google.com"},
    "spotify":   {"package": "com.spotify.music", "url": "https://open.spotify.com"},
    "telegram":  {"package": "org.telegram.messenger", "url": "https://web.telegram.org"},
    "twitter":   {"package": "com.twitter.android", "url": "https://x.com"},
    "x":         {"package": "com.twitter.android", "url": "https://x.com"},
    "snapchat":  {"package": "com.snapchat.android", "url": "https://snapchat.com"},
    "linkedin":  {"package": "com.linkedin.android", "url": "https://linkedin.com"},
    "paytm":     {"package": "net.one97.paytm", "url": "https://paytm.com"},
    "phonepe":   {"package": "com.phonepe.app", "url": "https://phonepe.com"},
    "gpay":      {"package": "com.google.android.apps.nbu.paisa.user", "url": "https://pay.google.com"},
    "amazon":    {"package": "in.amazon.mShop.android.shopping", "url": "https://amazon.in"},
    "flipkart":  {"package": "com.flipkart.android", "url": "https://flipkart.com"},
    "netflix":   {"package": "com.netflix.mediaclient", "url": "https://netflix.com"},
    "hotstar":   {"package": "in.startv.hotstar", "url": "https://hotstar.com"},
    "zomato":    {"package": "com.application.zomato", "url": "https://zomato.com"},
    "swiggy":    {"package": "in.swiggy.android", "url": "https://swiggy.com"},
    "uber":      {"package": "com.ubercab", "url": "https://uber.com"},
    "ola":       {"package": "com.olacabs.customer", "url": "https://olacabs.com"},
    "settings":  {"package": "com.android.settings", "url": ""},
    "camera":    {"package": "", "url": ""},
    "gallery":   {"package": "", "url": ""},
    "calculator": {"package": "", "url": ""},
    "clock":     {"package": "com.google.android.deskclock", "url": ""},
    "calendar":  {"package": "com.google.android.calendar", "url": "https://calendar.google.com"},
}

# Hindi/Hinglish app names mapped to canonical keys above.
APP_TRANSLIT = {
    "यूट्यूब": "youtube", "यूटयूब": "youtube", "व्हाट्सएप": "whatsapp",
    "व्हाट्सऐप": "whatsapp", "इंस्टाग्राम": "instagram", "फेसबुक": "facebook",
    "क्रोम": "chrome", "जीमेल": "gmail", "मैप्स": "maps", "नक्शा": "maps",
    "कैमरा": "camera", "गैलरी": "gallery", "सेटिंग": "settings",
    "सेटिंग्स": "settings", "कैलकुलेटर": "calculator", "घड़ी": "clock",
}

SETTINGS_PAGES = {
    "wifi": "android.settings.WIFI_SETTINGS",
    "wi-fi": "android.settings.WIFI_SETTINGS",
    "वाईफाई": "android.settings.WIFI_SETTINGS",
    "bluetooth": "android.settings.BLUETOOTH_SETTINGS",
    "ब्लूटूथ": "android.settings.BLUETOOTH_SETTINGS",
    "display": "android.settings.DISPLAY_SETTINGS",
    "brightness": "android.settings.DISPLAY_SETTINGS",
    "sound": "android.settings.SOUND_SETTINGS",
    "volume": "android.settings.SOUND_SETTINGS",
    "battery": "android.intent.action.POWER_USAGE_SUMMARY",
    "बैटरी": "android.intent.action.POWER_USAGE_SUMMARY",
    "location": "android.settings.LOCATION_SOURCE_SETTINGS",
    "gps": "android.settings.LOCATION_SOURCE_SETTINGS",
    "apps": "android.settings.APPLICATION_SETTINGS",
    "storage": "android.settings.INTERNAL_STORAGE_SETTINGS",
    "airplane": "android.settings.AIRPLANE_MODE_SETTINGS",
    "data": "android.settings.DATA_ROAMING_SETTINGS",
    "hotspot": "android.settings.WIRELESS_SETTINGS",
    "": "android.settings.SETTINGS",
}


def normalise(text: str) -> str:
    """Lower-case, strip punctuation noise, collapse whitespace."""
    text = unicodedata.normalize("NFKC", text or "").strip()
    text = re.sub(r"[’`]", "'", text)
    text = re.sub(r"\s+", " ", text)
    return text


def detect_language(text: str) -> str:
    """Return 'hi' for Hindi/Hinglish, else 'en'."""
    if DEVANAGARI.search(text):
        return "hi"
    words = set(re.findall(r"[a-z]+", text.lower()))
    return "hi" if len(words & HINGLISH_TOKENS) >= 1 else "en"


# --------------------------------------------------------------------------
# Time parsing (English + Hindi)
# --------------------------------------------------------------------------
HINDI_NUM = {
    "एक": 1, "दो": 2, "तीन": 3, "चार": 4, "पांच": 5, "पाँच": 5, "छह": 6,
    "छः": 6, "सात": 7, "आठ": 8, "नौ": 9, "दस": 10, "ग्यारह": 11, "बारह": 12,
}
WORD_NUM = {
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7,
    "eight": 8, "nine": 9, "ten": 10, "eleven": 11, "twelve": 12, "half": 30,
    "quarter": 15,
}


DURATION_RE = re.compile(
    r"(\d{1,4})\s*(hours?|hrs?|घंटे|घंटा|minutes?|mins?|मिनट|seconds?|secs?|सेकंड)",
    re.I,
)


def parse_duration(text: str) -> int | None:
    """Extract a plain duration in seconds, e.g. "for 10 minutes" -> 600."""
    m = DURATION_RE.search(text or "")
    if not m:
        return None
    qty, unit = int(m.group(1)), m.group(2).lower()
    if unit.startswith(("h", "घ")):
        return qty * 3600
    if unit.startswith(("s", "से")):
        return qty
    return qty * 60


def parse_time(text: str, now: datetime | None = None) -> datetime | None:
    """
    Best-effort extraction of a target datetime.

    Handles: "7 am", "7:30 pm", "सुबह 7 बजे", "raat 9 baje", "in 10 minutes",
             "20 मिनट बाद", "tomorrow 8", "kal subah 6".
    """
    now = now or datetime.now()
    t = text.lower()

    # -- relative: "in 10 minutes" / "10 minute baad" / "20 मिनट बाद" -------
    rel = re.search(
        r"(?:in|after|baad|बाद\s*में|के\s*बाद)?\s*(\d{1,3})\s*"
        r"(minutes?|mins?|minute|मिनट|hours?|hrs?|घंटे|घंटा|seconds?|secs?|सेकंड)"
        r"\s*(?:baad|later|बाद|से)?",
        t,
    )
    if rel and re.search(r"\b(in|after|baad|बाद|later|से)\b", t):
        qty = int(rel.group(1))
        unit = rel.group(2)
        if unit.startswith(("h", "घ")):
            return now + timedelta(hours=qty)
        if unit.startswith(("s", "से")):
            return now + timedelta(seconds=qty)
        return now + timedelta(minutes=qty)

    # -- absolute clock time ------------------------------------------------
    m = re.search(r"(\d{1,2})[:.](\d{2})\s*(am|pm|a\.m|p\.m)?", t)
    hour = minute = None
    if m:
        hour, minute = int(m.group(1)), int(m.group(2))
        meridiem = (m.group(3) or "").replace(".", "")
    else:
        # NOTE: a trailing \b fails after "बजे" because Devanagari vowel signs
        # are combining marks (not \w), so we use a non-word lookahead instead.
        m = re.search(r"(?<!\d)(\d{1,2})\s*(am|pm|a\.m|p\.m|बजे|baje|o'?clock)(?!\w)", t)
        if m:
            hour, minute = int(m.group(1)), 0
            meridiem = (m.group(2) or "").replace(".", "")
        else:
            # Hindi numerals: "सात बजे"
            for word, val in HINDI_NUM.items():
                if word in t and ("बजे" in t or "baje" in t):
                    hour, minute, meridiem = val, 0, ""
                    break
            else:
                return None

    # -- day-part words decide AM/PM when no meridiem is spoken -------------
    is_pm = meridiem.startswith("p")
    is_am = meridiem.startswith("a")
    if not (is_pm or is_am):
        if re.search(r"\b(शाम|sham|shaam|evening|रात|raat|night|dopahar|दोपहर|afternoon)\b", t):
            is_pm = True
        elif re.search(r"\b(सुबह|subah|morning|savere|सवेरे)\b", t):
            is_am = True

    if hour is None:
        return None
    if is_pm and hour < 12:
        hour += 12
    if is_am and hour == 12:
        hour = 0
    if not is_pm and not is_am and hour <= 7 and "am" not in t:
        # "set alarm for 7" at 10pm most likely means tomorrow 7am -> keep 7.
        pass

    target = now.replace(hour=hour % 24, minute=minute or 0, second=0, microsecond=0)
    if re.search(r"\b(tomorrow|kal|कल|अगले\s*दिन)\b", t):
        target += timedelta(days=1)
    elif target <= now:
        target += timedelta(days=1)
    return target


# --------------------------------------------------------------------------
# Entity helpers
# --------------------------------------------------------------------------
STOPWORD_TAIL = re.compile(
    r"\b(please|plz|karo|kar\s*do|kardo|kijiye|dijiye|abhi|now|for\s*me|jaldi|zara|na)\b\s*$",
    re.I,
)


def _clean(value: str) -> str:
    value = value.strip(" .,!?;:\"'“”")
    value = STOPWORD_TAIL.sub("", value).strip(" .,!?;:")
    return value


def _title(value: str) -> str:
    return " ".join(w.capitalize() if w.islower() else w for w in value.split())


# --- reminder title cleanup ------------------------------------------------
# A reminder capture usually still carries the *when* ("5 minute baad paani
# peene ka", "call papa at 5pm").  The time can sit at either end, so strip
# both, plus the trailing case particle that Hindi/Hinglish leaves behind.
_REMINDER_TIME_PREFIX = re.compile(
    r"^(?:(?:in|after|aaj|today|kal|tomorrow|parso|subah|shaam|raat|morning|"
    r"evening|night|सुबह|शाम|रात|आज|कल|परसों)\s+)?"
    r"(?:\d{1,3}\s*(?:minutes?|mins?|minute|मिनट|hours?|hrs?|ghante|घंटे|घंटा|"
    r"seconds?|secs?|सेकंड|days?|din)\s*)?"
    r"(?:baad|later|बाद|में|ke\s+baad|के\s*बाद|baje|बजे|am|pm)?\s*",
    re.I,
)
_REMINDER_TIME_SUFFIX = re.compile(
    r"\b(at|by|on|tomorrow|today|kal|aaj|में|baad|बाद|बजे|baje|subah|सुबह|"
    r"shaam|शाम|raat|रात)\b.*$",
    re.I,
)
_REMINDER_PARTICLE_LATIN = re.compile(
    r"[\s.,-]*(?<!\w)(?:ke\s+liye|ka|ki|ke|ko|the|an?|for|to)(?!\w)[\s.,-]*$",
    re.I,
)
_REMINDER_PARTICLE_DEVANAGARI = re.compile(
    r"[\s.,-]*(?:के\s+लिए|का|की|के|को|मुझे)[\s.,-]*$",
)
# Leading article left over from "reminder for the doctor appointment".
_REMINDER_ARTICLE = re.compile(r"^(?:the|an|a|ek)\s+", re.I)
# Leftovers that appear when a verb is captured as the title ("reminder laga do").
_REMINDER_FILLER = {
    "do", "de", "dena", "diya", "na", "o", "karo", "kar", "karna", "hai", "hain",
    "please", "the", "a", "an", "ki", "ka", "ke", "ko", "to", "for", "me", "mujhe",
    "दो", "दे", "देना", "करो", "है", "का", "की", "के", "को", "मुझे",
}


def _strip_particle(value: str) -> str:
    """Drop a trailing Hindi/Hinglish case particle ("... ka", "... ke liye")."""
    return _REMINDER_PARTICLE_DEVANAGARI.sub(
        "", _REMINDER_PARTICLE_LATIN.sub("", value.strip(" .,-")).strip(" .,-")
    ).strip(" .,-")


def _reminder_title(raw_title: str) -> str:
    """Strip when-phrases and particles; return '' when nothing meaningful is left."""
    text = raw_title.strip(" .,-")
    if not text or text.lower() in _REMINDER_FILLER:
        return ""

    def keep(candidate: str) -> str | None:
        candidate = _REMINDER_ARTICLE.sub("", candidate.strip(" .,-")).strip(" .,-")
        if candidate and candidate.lower() not in _REMINDER_FILLER:
            return candidate
        return None

    head = _REMINDER_TIME_PREFIX.sub("", text, count=1).strip(" .,-")
    for candidate in (
        _strip_particle(_REMINDER_TIME_SUFFIX.sub("", head)),   # drop both ends
        _strip_particle(head),                                  # leading time only
        _strip_particle(_REMINDER_TIME_SUFFIX.sub("", text)),   # trailing time only
    ):
        if kept := keep(candidate):
            return kept
    return ""


# Words that are never a city name — used to reject bad weather captures.
_CITY_STOPWORDS = {
    "today", "tomorrow", "now", "hai", "kaisa", "kaisi", "here", "outside",
    "me", "my", "the", "this", "current", "weather", "temperature", "forecast",
    "mausam", "rain", "raining", "barish", "garmi", "thand",
    "मौसम", "तापमान", "बारिश", "गर्मी", "ठंड", "बताओ", "आज", "कल", "अभी",
    "कैसा", "कैसी", "है", "यहाँ", "यहां",
}
# Any weather keyword appearing inside a capture means we grabbed the wrong span.
_WEATHER_WORDS = re.compile(
    r"(weather|temperature|forecast|mausam|मौसम|तापमान|barish|बारिश|"
    r"garmi|गर्मी|thand|ठंड|batao|बताओ|bata|kaisa|कैसा|कैसी)",
    re.I,
)


def _valid_city(candidate: str) -> str | None:
    """Return a cleaned city name, or None when the capture is clearly not a place."""
    city = _clean(candidate).strip(" .,!?;:")
    # Drop a dangling postposition the capture may have swallowed ("आज का" -> "आज").
    city = re.sub(r"\s*(?:का|की|के|में|ka|ki|ke|mein)$", "", city, flags=re.I).strip()
    if not city or len(city) < 2:
        return None
    # Reject captures that swallowed a weather keyword ("मौसम बताओ", "weather today").
    if _WEATHER_WORDS.search(city):
        return None
    words = [w for w in re.split(r"\s+", city) if w]
    if not words or all(w.lower() in _CITY_STOPWORDS for w in words):
        return None
    if len(words) > 3:  # a sentence, not a place name
        return None
    return _title(city)


def _extract_city(raw: str) -> str | None:
    """Extract a city from a weather query in either word order.

    English puts the place after the preposition ("weather in Delhi"), while
    Hindi puts it *before* the postposition ("दिल्ली का मौसम"). Handle both.
    """
    text = raw.strip(" .,!?;:\"'“”")

    # 1) Hindi/Hinglish: "<city> का/की/के/में मौसम …"  -> city precedes postposition
    hi = re.search(
        r"([A-Za-z\u0900-\u097F][A-Za-z\u0900-\u097F\s]{1,29}?)\s*"
        r"(?:का|की|के|में|ka|ki|ke|mein)\s+"
        r"(?:weather|temperature|forecast|mausam|मौसम|तापमान|barish|बारिश)",
        text, re.I,
    )
    if hi and (city := _valid_city(hi.group(1))):
        return city

    # 2) English: "weather in/at/for <city>"  -> city follows the preposition
    en = re.search(
        r"(?:weather|temperature|forecast|mausam|rain(?:ing)?|hot|cold)\b[^.]*?"
        r"\b(?:in|at|for|of)\s+([A-Za-z\u0900-\u097F][A-Za-z\u0900-\u097F\s]{1,29})$",
        text, re.I,
    )
    if en and (city := _valid_city(en.group(1))):
        return city

    # 3) Generic trailing "in/at/for <city>" fallback
    tail = re.search(
        r"\b(?:in|at|for)\s+([A-Za-z\u0900-\u097F][A-Za-z\u0900-\u097F\s]{1,29})$",
        text, re.I,
    )
    if tail and (city := _valid_city(tail.group(1))):
        return city

    # 4) Bare Devanagari lead-in: "दिल्ली मौसम" (no postposition at all)
    bare = re.search(
        r"^([\u0900-\u097F][\u0900-\u097F\s]{1,25}?)\s+(?:मौसम|तापमान)", text
    )
    if bare and (city := _valid_city(bare.group(1))):
        return city

    return None


def match_app(raw: str) -> tuple[str, dict[str, str]] | None:
    """Map a spoken app name to a canonical entry in APP_ALIASES."""
    key = _clean(raw).lower()
    key = APP_TRANSLIT.get(key.strip(), key)
    key = re.sub(r"\b(app|application|ऐप|एप)\b", "", key).strip()
    if not key:
        return None
    if key in APP_ALIASES:
        return key, APP_ALIASES[key]
    for alias, meta in APP_ALIASES.items():          # fuzzy contains match
        if alias in key or key in alias:
            return alias, meta
    return key, {"package": "", "url": ""}           # unknown -> launcher search


# --------------------------------------------------------------------------
# Intent rules
# --------------------------------------------------------------------------
# Each rule: (intent name, compiled pattern, capture-group meaning, weight)
RULES: list[tuple[str, re.Pattern[str], str, float]] = [
    # ---- calling ---------------------------------------------------------
    ("call", re.compile(r"^(?:please\s+)?(?:call|dial|phone|ring)\s+(?:to\s+)?(.+)$", re.I), "contact", 0.95),
    ("call", re.compile(r"^(.+?)\s*(?:ko|को)\s*(?:phone|call|फ़ोन|फोन|कॉल)\s*(?:karo|kar\s*do|lagao|milao|करो|कीजिए|लगाओ|मिलाओ)?$", re.I), "contact", 0.94),
    ("call", re.compile(r"^(?:कॉल|फोन)\s+(.+?)\s*(?:को)?$", re.I), "contact", 0.9),

    # ---- messaging -------------------------------------------------------
    ("message", re.compile(r"^(?:send|write|text)\s+(?:a\s+)?(?:message|msg|sms|whatsapp)\s+to\s+(.+?)(?:\s+(?:saying|that|:)\s+(.+))?$", re.I), "contact_body", 0.95),
    ("message", re.compile(r"^(?:message|msg|text|whatsapp)\s+(.+?)(?:\s+(?:saying|that|:)\s+(.+))?$", re.I), "contact_body", 0.85),
    ("message", re.compile(r"^(.+?)\s*(?:ko|को)\s*(?:message|msg|मैसेज|संदेश|whatsapp)\s*(?:bhejo|bhej\s*do|karo|भेजो|भेज\s*दो|करो)?\s*(?:ki|कि)?\s*(.*)$", re.I), "contact_body", 0.92),

    # ---- open app --------------------------------------------------------
    ("open_app", re.compile(r"^(?:open|launch|start|run|khol(?:o)?)\s+(?:the\s+)?(.+?)\s*(?:app|application)?$", re.I), "app", 0.9),
    ("open_app", re.compile(r"^(.+?)\s*(?:को)?\s*(?:खोलो|खोलिए|खोल\s*दो|चालू\s*करो|ओपन\s*करो|open\s*karo|kholo)$", re.I), "app", 0.9),

    # ---- camera / gallery / files ---------------------------------------
    ("camera", re.compile(r"\b(open\s+)?(camera|selfie|photo\s*kheech|कैमरा|फोटो\s*खींच|take\s+a\s+(photo|picture|selfie))\b", re.I), "", 0.93),
    ("gallery", re.compile(r"\b(find|show|open|dikhao|dhundo)?\s*(my\s+)?(photos?|pictures?|gallery|images?|तस्वीर\w*|फोटो|गैलरी)\b", re.I), "query", 0.92),
    ("files", re.compile(r"\b(open\s+)?(files?|file\s*manager|documents?|downloads?|फाइल|फ़ाइल)\b", re.I), "query", 0.75),

    # ---- search ----------------------------------------------------------
    ("youtube_search", re.compile(r"^(?:play|search|find|dhundo|खोजो|चलाओ)\s+(.+?)\s+(?:on|पर)\s*(?:youtube|यूट्यूब)$", re.I), "query", 0.95),
    ("youtube_search", re.compile(r"^(?:youtube|यूट्यूब)\s*(?:pe|par|पर|on)?\s*(.+?)\s*(?:chalao|play|search|खोजो|चलाओ|dikhao)?$", re.I), "query", 0.7),
    ("web_search", re.compile(r"^(?:search|google|look\s*up|find|browse)\s+(?:for\s+)?(.+)$", re.I), "query", 0.9),
    ("web_search", re.compile(r"^(.+?)\s*(?:के\s*बारे\s*में|ke\s*bare\s*me)\s*(?:search|खोजो|बताओ|batao)$", re.I), "query", 0.85),
    ("web_search", re.compile(r"^(?:search|खोजो|सर्च)\s*(?:करो)?\s+(.+)$", re.I), "query", 0.85),

    # ---- alarm / timer ---------------------------------------------------
    ("alarm", re.compile(r"\b(set|lagao|laga\s*do|create)?\s*(?:an?\s+)?(alarm|अलार्म)\b", re.I), "", 0.93),
    ("timer", re.compile(r"\b(set|start|lagao)?\s*(?:a\s+)?(timer|टाइमर|stopwatch)\b", re.I), "", 0.9),

    # ---- reminders / tasks / notes --------------------------------------
    ("reminder", re.compile(r"^(?:remind\s+me\s+(?:to\s+)?|reminder\s+(?:for|to)\s+|set\s+a?\s*reminder\s+(?:to|for)\s+)(.+)$", re.I), "title", 0.95),
    ("reminder", re.compile(r"^(?:mujhe\s+)?(.+?)\s*(?:ki|की|ka|का)?\s*(?:yaad\s*dila(?:na|o|\s*do|\s*dena)?|याद\s*दिला(?:ना|ओ|\s*दो|\s*देना)?|reminder\s*lag(?:ao|a\s*(?:do|de|dena|diya)?|ana))$", re.I), "title", 0.9),
    # Verb-first Hindi/Hinglish: "yaad dilana dawa lena", "reminder laga do paani peena"
    ("reminder", re.compile(r"^(?:mujhe\s+)?(?:yaad\s*dila(?:na|o|\s*do|\s*dena)|याद\s*दिला(?:ना|ओ|\s*दो|\s*देना)|reminder\s*lag(?:ao|a\s*(?:do|de|dena|diya)?|ana))\s*(?:ki\s+|कि\s+|to\s+|के\s+लिए\s+)?(.+?)$", re.I), "title", 0.88),
    ("task", re.compile(r"^(?:add|create|new)\s+(?:a\s+)?(?:task|todo|to-?do)\s*(?::|to)?\s*(.+)$", re.I), "title", 0.95),
    # "Add buy milk to my todo list" / "put call bank in my task list"
    ("task", re.compile(r"^(?:add|put|note)\s+(.+?)\s+(?:to|in|into|on)\s+(?:the\s+|my\s+)?(?:todo|to-?do|task)s?\s*(?:list)?$", re.I), "title", 0.95),
    ("task", re.compile(r"^(.+?)\s*(?:को)?\s*(?:my\s+|मेरी\s+|meri\s+)?(?:todo|to-?do|task|टास्क|लिस्ट|सूची|काम)\s*(?:list|लिस्ट)?\s*(?:me|में|in)?\s*(?:add\s*karo|जोड़(?:ो|ें|िए)|शामिल\s*करो|add)$", re.I), "title", 0.88),
    ("note", re.compile(r"^(?:note\s+(?:down|this)?|write\s+(?:down|a\s+note)|save\s+a?\s*note|make\s+a?\s*note|voice\s+note)\s*:?\s*(.*)$", re.I), "body", 0.92),
    ("note", re.compile(r"^(?:note|नोट)\s*(?:karo|kar\s*lo|करो|बनाओ|लिखो)\s*:?\s*(.*)$", re.I), "body", 0.9),
    ("planner", re.compile(r"\b(my\s+)?(day|schedule|planner|plan|agenda|आज\s*का\s*प्लान|दिनचर्या|routine)\b.*\b(today|kaisa|kya|plan|schedule|dikhao|बताओ|दिखाओ)?\b", re.I), "", 0.6),
    ("list_tasks", re.compile(r"\b(show|list|what\s+are|read)\s+(?:my\s+)?(tasks?|to-?dos?|todo\s*list|काम|कार्य)\b", re.I), "", 0.9),

    # ---- info tools ------------------------------------------------------
    ("weather", re.compile(r"\b(weather|temperature|forecast|mausam|मौसम|तापमान|barish|बारिश|rain(?:ing)?|garmi|गर्मी|thand|ठंड)\b", re.I), "city", 0.92),
    ("news", re.compile(r"\b(news|headlines|khabar|खबर|समाचार|सुर्ख)\w*\b", re.I), "topic", 0.9),
    ("translate", re.compile(r"^(?:translate|अनुवाद)\s+(.+?)\s+(?:to|into|में|me)\s+(\w+)\s*(?:language|भाषा)?$", re.I), "text_lang", 0.96),
    ("translate", re.compile(r"^(.+?)\s+(?:ko|को)\s+(\w+)\s*(?:me|में)\s*(?:translate|अनुवाद)\s*(?:karo|करो|kijiye)?$", re.I), "text_lang", 0.94),
    ("translate", re.compile(r"^(?:how\s+do\s+you\s+say|hindi\s+me\s+kya\s+kehte\s+hain?)\s+(.+)$", re.I), "text", 0.85),
    ("calculate", re.compile(r"^(?:calculate|compute|what\s+is|solve|kitna\s+hota\s+hai|hisaab)?\s*([\d\s\.\+\-\*\/\^%\(\)]{3,}|\d+\s*(?:percent|%|प्रतिशत)\s*of\s*\d+)\s*(?:=|\?)?$", re.I), "expr", 0.9),
    ("calculate", re.compile(r"^(?:calculate|compute|solve)\s+(.+)$", re.I), "expr", 0.85),

    # ---- device ----------------------------------------------------------
    ("settings", re.compile(r"\b(open\s+)?(?:phone\s+)?(settings?|सेटिंग्?स?)\b\s*(?:for|of|ki|की)?\s*(\w+)?", re.I), "page", 0.85),
    ("navigate", re.compile(r"^(?:navigate|directions?|take\s+me|route)\s+(?:to\s+)?(.+)$", re.I), "place", 0.93),
    ("navigate", re.compile(r"^(.+?)\s*(?:का\s*रास्ता|ka\s*rasta|tak\s*kaise)\s*(?:batao|दिखाओ|बताओ)?$", re.I), "place", 0.88),
    ("music", re.compile(r"^(?:play|chalao|बजाओ|सुनाओ)\s+(?:some\s+)?(?:music|song|gana|गाना|संगीत)\s*(.*)$", re.I), "query", 0.9),
    ("flashlight", re.compile(r"\b(flash\s*light|torch|टॉर्च|फ्लैश)\b", re.I), "", 0.9),
    ("battery", re.compile(r"\b(battery|बैटरी)\s*(status|level|percent|kitni|कितनी)?\b", re.I), "", 0.85),

    # ---- social ----------------------------------------------------------
    ("greeting", re.compile(r"^(hi|hey|hello|yo|namaste|नमस्ते|नमस्कार|हैलो|hey\s+ajay|good\s+(morning|afternoon|evening))\b.*$", re.I), "", 0.9),
    ("thanks", re.compile(r"\b(thanks?|thank\s+you|shukriya|शुक्रिया|धन्यवाद|dhanyavad)\b", re.I), "", 0.9),
    ("who_are_you", re.compile(r"\b(who\s+are\s+you|what\s+are\s+you|tum\s+kaun|तुम\s+कौन|आप\s+कौन|your\s+name|tumhara\s+naam)\b", re.I), "", 0.95),
    ("help", re.compile(r"\b(help|what\s+can\s+you\s+do|commands?|kya\s+kar\s+sakte|क्या\s+कर\s+सकते|मदद)\b", re.I), "", 0.9),
    ("time_now", re.compile(r"\b(what(?:'s| is)?\s+the\s+time|time\s+kya|kitne\s+baje|समय\s+क्या|कितने\s+बजे)\b", re.I), "", 0.95),
    ("date_now", re.compile(r"\b(what(?:'s| is)?\s+(?:today'?s?\s+)?date|aaj\s+ki\s+tarikh|आज\s+की\s+तारीख|kaunsa\s+din)\b", re.I), "", 0.95),
    ("stop", re.compile(r"^(stop|cancel|quiet|chup|रुको|बंद\s*करो|nevermind|never\s+mind)\b", re.I), "", 0.9),
]


def parse(text: str, *, now: datetime | None = None, default_city: str | None = None) -> Intent:
    """Run the full rule pipeline and return the best-scoring intent."""
    now = now or datetime.now()
    raw = normalise(text)
    lang = detect_language(raw)
    best: Intent | None = None

    for name, pattern, capture, weight in RULES:
        m = pattern.search(raw)
        if not m:
            continue
        intent = _build(name, m, capture, weight, raw, lang, now, default_city)
        if intent and (best is None or intent.confidence > best.confidence):
            best = intent

    if best is None:
        # No rule fired -> conversational fallback (LLM handles it upstream).
        best = Intent(
            name="chat",
            confidence=0.3,
            language=lang,
            action_type=ActionType.SPEAK_ONLY,
            reply_en="Let me think about that…",
            reply_hi="इस पर सोचने दीजिए…",
        )
    return best


def _build(  # noqa: C901 - a dispatch table by nature
    name: str,
    m: re.Match[str],
    capture: str,
    weight: float,
    raw: str,
    lang: str,
    now: datetime,
    default_city: str | None,
) -> Intent | None:
    g = [_clean(x) for x in (m.groups() or ()) if x]
    first = g[0] if g else ""

    def I(**kw: Any) -> Intent:  # noqa: N802 - concise local factory
        kw.setdefault("confidence", weight)
        kw.setdefault("language", lang)
        return Intent(name=name, **kw)

    # ---------------------------------------------------------------- call
    if name == "call":
        contact = _title(re.sub(r"\b(number|par|pe|on)\b.*$", "", first).strip())
        if not contact or len(contact) > 40:
            return None
        digits = re.sub(r"\D", "", contact)
        params = {"contact": contact, "number": digits if len(digits) >= 6 else None}
        return I(
            entities={"contact": contact},
            action_type=ActionType.CALL,
            params=params,
            reply_en=f"Calling {contact}. Shall I dial now?",
            reply_hi=f"{contact} को कॉल कर रहा हूँ। डायल करूँ?",
        )

    # ------------------------------------------------------------- message
    if name == "message":
        contact = _title(g[0]) if g else ""
        body = g[1] if len(g) > 1 else ""
        if not contact:
            return None
        channel = "whatsapp" if re.search(r"whatsapp|व्हाट्स", raw, re.I) else "sms"
        return I(
            entities={"contact": contact, "body": body, "channel": channel},
            action_type=ActionType.WHATSAPP if channel == "whatsapp" else ActionType.SMS,
            params={"contact": contact, "body": body, "channel": channel},
            reply_en=(f'Message to {contact}: "{body}". Send it?' if body
                      else f"What should I say to {contact}?"),
            reply_hi=(f'{contact} को संदेश: "{body}"। भेज दूँ?' if body
                      else f"{contact} को क्या कहना है?"),
        )

    # ------------------------------------------------------------ open app
    if name == "open_app":
        hit = match_app(first)
        if not hit:
            return None
        key, meta = hit
        if key == "settings":
            page = ""
            for candidate in SETTINGS_PAGES:
                if candidate and re.search(rf"\b{re.escape(candidate)}\b", raw, re.I):
                    page = candidate
                    break
            return I(
                action_type=ActionType.OPEN_SETTINGS,
                params={"page": page or "main", "intent": SETTINGS_PAGES[page]},
                reply_en=f"Opening {page or 'phone'} settings.",
                reply_hi=f"{page or 'फ़ोन'} सेटिंग्स खोल रहा हूँ।",
            )
        if key in {"camera", "gallery", "calculator"}:
            mapped = {"camera": ActionType.OPEN_CAMERA,
                      "gallery": ActionType.OPEN_GALLERY,
                      "calculator": ActionType.OPEN_APP}[key]
            return I(
                action_type=mapped,
                params={"app": key, "package": meta.get("package", "")},
                reply_en=f"Opening {key}.",
                reply_hi=f"{key} खोल रहा हूँ।",
            )
        return I(
            entities={"app": key},
            action_type=ActionType.OPEN_APP,
            params={"app": key, "package": meta.get("package", ""), "url": meta.get("url", "")},
            reply_en=f"Opening {_title(key)}.",
            reply_hi=f"{_title(key)} खोल रहा हूँ।",
        )

    # -------------------------------------------------------------- camera
    if name == "camera":
        return I(action_type=ActionType.OPEN_CAMERA, params={"mode": "photo"},
                 reply_en="Opening the camera.", reply_hi="कैमरा खोल रहा हूँ।")

    if name == "gallery":
        q = first if first and first.lower() not in {"my", "photos", "gallery"} else ""
        return I(action_type=ActionType.OPEN_GALLERY, params={"query": q},
                 reply_en="Here are your photos.", reply_hi="ये रहीं आपकी तस्वीरें।")

    if name == "files":
        return I(action_type=ActionType.OPEN_FILES, params={"query": first},
                 reply_en="Opening your files.", reply_hi="आपकी फ़ाइलें खोल रहा हूँ।")

    # -------------------------------------------------------------- search
    if name == "youtube_search":
        q = first
        if not q or len(q) < 2:
            return None
        return I(entities={"query": q}, action_type=ActionType.YOUTUBE_SEARCH,
                 params={"query": q, "url": f"https://www.youtube.com/results?search_query={q}"},
                 reply_en=f"Searching YouTube for {q}.", reply_hi=f"यूट्यूब पर {q} खोज रहा हूँ।")

    if name == "web_search":
        q = re.sub(r"^(for|about)\s+", "", first, flags=re.I)
        if not q or len(q) < 2:
            return None
        # "find my photos" / "open camera" are device intents, not web searches.
        if re.search(r"\b(my\s+)?(photos?|pictures?|gallery|images?|camera|files?|तस्वीर|फोटो|गैलरी)\b", q, re.I):
            return None
        # "search cricket news" is a news request, not a plain web search.
        if re.search(r"\b(news|khabar|खबर|समाचार)\b", q, re.I):
            topic = re.sub(r"\b(news|khabar|खबर|समाचार|latest|ताज़ा)\b", "", q, flags=re.I).strip() or "top"
            return Intent(name="news", confidence=0.93, language=lang,
                          entities={"topic": topic}, action_type=ActionType.SHOW_NEWS,
                          params={"topic": topic}, needs_tool="news",
                          reply_en=f"Here are the latest {topic} headlines.",
                          reply_hi=f"{topic} की ताज़ा खबरें ये रहीं।")
        return I(entities={"query": q}, action_type=ActionType.WEB_SEARCH,
                 params={"query": q, "url": f"https://www.google.com/search?q={q}"},
                 reply_en=f"Searching the web for {q}.", reply_hi=f"{q} इंटरनेट पर खोज रहा हूँ।")

    # --------------------------------------------------------- alarm/timer
    if name == "alarm":
        when = parse_time(raw, now)
        if not when:
            return I(confidence=0.7, action_type=ActionType.SPEAK_ONLY,
                     reply_en="What time should I set the alarm for?",
                     reply_hi="अलार्म किस समय का लगाऊँ?")
        label = "Ajay AI Assistant"
        return I(entities={"time": when.isoformat()},
                 action_type=ActionType.SET_ALARM,
                 params={"hour": when.hour, "minute": when.minute,
                         "iso": when.isoformat(), "label": label},
                 reply_en=f"Alarm set for {when.strftime('%I:%M %p').lstrip('0')}.",
                 reply_hi=f"{when.strftime('%I:%M %p').lstrip('0')} का अलार्म लगा दिया।")

    if name == "timer":
        seconds = parse_duration(raw)
        if seconds is None:
            when = parse_time(raw, now)
            seconds = int((when - now).total_seconds()) if when else 300
        seconds = max(5, min(seconds, 86400))
        mins = round(seconds / 60)
        return I(action_type=ActionType.SET_TIMER, params={"seconds": seconds},
                 reply_en=f"Timer started for {mins} minute{'s' if mins != 1 else ''}.",
                 reply_hi=f"{mins} मिनट का टाइमर चालू।")

    # ------------------------------------------------ reminders/tasks/notes
    if name == "reminder":
        when = parse_time(raw, now)
        title = _reminder_title(first)
        if not title:
            return None
        stamp = (when or now + timedelta(hours=1))
        return I(entities={"title": title, "time": stamp.isoformat()},
                 action_type=ActionType.CREATE_REMINDER,
                 params={"title": _title(title), "remind_at": stamp.isoformat()},
                 reply_en=f"Reminder saved: {title} at {stamp.strftime('%I:%M %p').lstrip('0')}.",
                 reply_hi=f"रिमाइंडर सेव: {title}, {stamp.strftime('%I:%M %p').lstrip('0')} बजे।")

    if name == "task":
        if not first:
            return None
        return I(entities={"title": first}, action_type=ActionType.CREATE_TASK,
                 params={"title": _title(first), "priority": 2 if re.search(r"urgent|important|जरूरी", raw, re.I) else 1},
                 reply_en=f"Added “{first}” to your to-do list.",
                 reply_hi=f"“{first}” आपकी सूची में जोड़ दिया।")

    if name == "note":
        body = first
        if not body:
            return I(confidence=0.75, action_type=ActionType.SPEAK_ONLY,
                     reply_en="Sure — what should I note down?",
                     reply_hi="ज़रूर — क्या नोट करूँ?")
        return I(entities={"body": body}, action_type=ActionType.CREATE_NOTE,
                 params={"body": body, "title": body[:40]},
                 reply_en="Note saved.", reply_hi="नोट सेव कर दिया।")

    if name in {"planner", "list_tasks"}:
        return I(action_type=ActionType.SHOW_PLANNER, params={"scope": "today"},
                 reply_en="Here's your plan for today.", reply_hi="आज का आपका प्लान ये रहा।")

    # ---------------------------------------------------------------- info
    if name == "weather":
        city = _extract_city(raw)
        return I(entities={"city": city or default_city}, action_type=ActionType.SHOW_WEATHER,
                 params={"city": city or default_city or "Delhi"}, needs_tool="weather",
                 reply_en="Checking the weather…", reply_hi="मौसम देख रहा हूँ…")

    if name == "news":
        topic = re.sub(
            r"\b(news|headlines|khabar|खबर|समाचार|latest|today|ताज़ा|taza|batao|बताओ|show|me|the|top|search|about)\b",
            "", raw, flags=re.I,
        ).strip(" .,-") or "top"
        return I(entities={"topic": topic}, action_type=ActionType.SHOW_NEWS,
                 params={"topic": topic}, needs_tool="news",
                 reply_en=f"Fetching {topic} headlines…", reply_hi=f"{topic} की खबरें ला रहा हूँ…")

    if name == "translate":
        if capture == "text_lang" and len(g) >= 2:
            payload, target = g[0], g[1].lower()
        else:
            payload, target = first, "hi"
        return I(entities={"text": payload, "target": target},
                 action_type=ActionType.TRANSLATE,
                 params={"text": payload, "target": target}, needs_tool="translate",
                 reply_en="Translating…", reply_hi="अनुवाद कर रहा हूँ…")

    if name == "calculate":
        expr = first
        if not re.search(r"\d", expr):
            return None
        return I(entities={"expression": expr}, action_type=ActionType.CALCULATE,
                 params={"expression": expr}, needs_tool="calculator",
                 reply_en="Calculating…", reply_hi="गणना कर रहा हूँ…")

    # -------------------------------------------------------------- device
    if name == "settings":
        page_word = (g[-1] if g else "").lower()
        page_word = page_word if page_word in SETTINGS_PAGES else ""
        for key in SETTINGS_PAGES:
            if key and re.search(rf"\b{re.escape(key)}\b", raw, re.I):
                page_word = key
                break
        return I(action_type=ActionType.OPEN_SETTINGS,
                 params={"page": page_word or "main", "intent": SETTINGS_PAGES[page_word]},
                 reply_en=f"Opening {page_word or 'phone'} settings.",
                 reply_hi=f"{page_word or 'फ़ोन'} सेटिंग्स खोल रहा हूँ।")

    if name == "navigate":
        place = first
        if not place:
            return None
        return I(entities={"place": place}, action_type=ActionType.NAVIGATE,
                 params={"place": place, "url": f"https://www.google.com/maps/dir/?api=1&destination={place}"},
                 reply_en=f"Starting navigation to {place}.", reply_hi=f"{place} के लिए रास्ता दिखा रहा हूँ।")

    if name == "music":
        q = first or "trending songs"
        return I(action_type=ActionType.PLAY_MUSIC, params={"query": q},
                 reply_en=f"Playing {q}.", reply_hi=f"{q} चला रहा हूँ।")

    if name == "flashlight":
        on = not re.search(r"\b(off|band|बंद|बुझा)\b", raw, re.I)
        return I(action_type=ActionType.TOGGLE_FLASHLIGHT, params={"on": on},
                 reply_en=f"Torch {'on' if on else 'off'}.",
                 reply_hi=f"टॉर्च {'चालू' if on else 'बंद'}।")

    if name == "battery":
        return I(action_type=ActionType.BATTERY_STATUS, params={},
                 reply_en="Checking your battery.", reply_hi="बैटरी देख रहा हूँ।")

    # -------------------------------------------------------------- social
    if name == "greeting":
        hour = now.hour
        part_en = "morning" if hour < 12 else "afternoon" if hour < 17 else "evening"
        part_hi = "सुप्रभात" if hour < 12 else "नमस्ते" if hour < 17 else "शुभ संध्या"
        return I(action_type=ActionType.SPEAK_ONLY,
                 reply_en=f"Good {part_en}! I'm Ajay. How can I help you?",
                 reply_hi=f"{part_hi}! मैं अजय हूँ। मैं आपकी क्या मदद करूँ?")

    if name == "thanks":
        return I(action_type=ActionType.SPEAK_ONLY,
                 reply_en="Anytime! Anything else?", reply_hi="हमेशा हाज़िर! और कुछ?")

    if name == "who_are_you":
        return I(action_type=ActionType.SPEAK_ONLY,
                 reply_en="I'm Ajay, your personal AI assistant. I can call, message, "
                          "open apps, set alarms, take notes and much more — in Hindi or English.",
                 reply_hi="मैं अजय हूँ, आपका निजी AI असिस्टेंट। मैं कॉल, मैसेज, ऐप्स, "
                          "अलार्म, नोट्स और बहुत कुछ कर सकता हूँ — हिंदी और अंग्रेज़ी दोनों में।")

    if name == "help":
        return I(action_type=ActionType.SPEAK_ONLY,
                 reply_en="Try: “Call Rahul”, “Send message to Amit”, “Open YouTube”, "
                          "“Search cricket news”, “Set alarm for 7 AM”, “Open camera”, "
                          "“Find my photos”, “Weather in Delhi”, “Translate good morning to Hindi”.",
                 reply_hi="कहकर देखिए: “राहुल को कॉल करो”, “अमित को मैसेज भेजो”, “यूट्यूब खोलो”, "
                          "“क्रिकेट न्यूज़ खोजो”, “सुबह 7 बजे अलार्म लगाओ”, “कैमरा खोलो”, "
                          "“मेरी फोटो दिखाओ”, “दिल्ली का मौसम”।")

    if name == "time_now":
        return I(action_type=ActionType.SPEAK_ONLY,
                 reply_en=f"It's {now.strftime('%I:%M %p').lstrip('0')}.",
                 reply_hi=f"अभी {now.strftime('%I:%M %p').lstrip('0')} बजे हैं।")

    if name == "date_now":
        return I(action_type=ActionType.SPEAK_ONLY,
                 reply_en=f"Today is {now.strftime('%A, %d %B %Y')}.",
                 reply_hi=f"आज {now.strftime('%A, %d %B %Y')} है।")

    if name == "stop":
        return I(action_type=ActionType.SPEAK_ONLY, speak=False,
                 reply_en="Okay, stopped.", reply_hi="ठीक है, रोक दिया।")

    return None
