"""
Translation service.

Primary  : MyMemory public API (free, keyless).
Fallback : a small built-in Hindi/English phrasebook so the demo still answers
           the most common utterances with no network at all.
"""

from __future__ import annotations

from typing import Any

import httpx

from ..config import settings

LANG_CODES: dict[str, str] = {
    "hindi": "hi", "hi": "hi", "हिंदी": "hi", "हिन्दी": "hi",
    "english": "en", "en": "en", "अंग्रेजी": "en", "अंग्रेज़ी": "en",
    "spanish": "es", "es": "es", "french": "fr", "fr": "fr",
    "german": "de", "de": "de", "arabic": "ar", "ar": "ar",
    "japanese": "ja", "ja": "ja", "chinese": "zh", "zh": "zh",
    "bengali": "bn", "bn": "bn", "tamil": "ta", "ta": "ta",
    "telugu": "te", "te": "te", "marathi": "mr", "mr": "mr",
    "gujarati": "gu", "gu": "gu", "punjabi": "pa", "pa": "pa",
    "urdu": "ur", "ur": "ur", "kannada": "kn", "kn": "kn",
    "malayalam": "ml", "ml": "ml", "russian": "ru", "ru": "ru",
    "portuguese": "pt", "pt": "pt", "italian": "it", "it": "it",
}

# Offline phrasebook (en <-> hi) used when the network call fails.
PHRASEBOOK: dict[str, str] = {
    "good morning": "सुप्रभात",
    "good night": "शुभ रात्रि",
    "good evening": "शुभ संध्या",
    "how are you": "आप कैसे हैं",
    "thank you": "धन्यवाद",
    "thanks": "शुक्रिया",
    "hello": "नमस्ते",
    "welcome": "स्वागत है",
    "i love you": "मैं तुमसे प्यार करता हूँ",
    "what is your name": "आपका नाम क्या है",
    "see you soon": "जल्द मिलते हैं",
    "please help me": "कृपया मेरी मदद करें",
    "i am hungry": "मुझे भूख लगी है",
    "where are you": "आप कहाँ हैं",
    "happy birthday": "जन्मदिन मुबारक",
    "congratulations": "बधाई हो",
    "sorry": "माफ़ कीजिए",
    "yes": "हाँ",
    "no": "नहीं",
}
REVERSE_PHRASEBOOK = {v: k for k, v in PHRASEBOOK.items()}


def resolve_lang(name: str | None, default: str = "hi") -> str:
    if not name:
        return default
    return LANG_CODES.get(name.strip().lower(), default)


async def translate(text: str, target: str = "hi", source: str | None = None) -> dict[str, Any]:
    text = (text or "").strip()
    if not text:
        return {"ok": False, "error": "Nothing to translate."}

    tgt = resolve_lang(target)
    src = resolve_lang(source, "en") if source else ("hi" if any("\u0900" <= c <= "\u097f" for c in text) else "en")
    if src == tgt:
        src = "en" if tgt != "en" else "hi"

    try:
        async with httpx.AsyncClient(timeout=settings.HTTP_TIMEOUT_S) as client:
            r = await client.get(settings.TRANSLATE_URL,
                                 params={"q": text, "langpair": f"{src}|{tgt}"})
            r.raise_for_status()
            payload = r.json()
        translated = (payload.get("responseData") or {}).get("translatedText")
        if translated and translated.upper() != "NO QUERY SPECIFIED":
            return {"ok": True, "source": src, "target": tgt,
                    "original": text, "translated": translated,
                    "spoken": translated, "engine": "mymemory"}
    except Exception:  # noqa: BLE001 - fall through to the offline book
        pass

    key = text.lower().strip(" .!?")
    offline = PHRASEBOOK.get(key) if tgt == "hi" else REVERSE_PHRASEBOOK.get(text.strip())
    if offline:
        return {"ok": True, "source": src, "target": tgt, "original": text,
                "translated": offline, "spoken": offline, "engine": "offline"}
    return {"ok": False, "error": "Translation service unavailable right now.",
            "original": text, "target": tgt}
