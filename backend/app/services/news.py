"""
News service backed by Google News RSS (free, no API key).

Returns a compact list of headlines plus a one-line spoken summary that the
TTS engine can read out without sounding like a web page.
"""

from __future__ import annotations

import re
from typing import Any
from xml.etree import ElementTree as ET

import httpx

from ..config import settings

_TAG_RE = re.compile(r"<[^>]+>")


def _strip_html(text: str) -> str:
    return _TAG_RE.sub("", text or "").replace("&nbsp;", " ").strip()


async def get_news(topic: str = "top", language: str = "en", limit: int = 6) -> dict[str, Any]:
    topic = (topic or "top").strip() or "top"
    hl, gl, ceid = ("hi", "IN", "IN:hi") if language == "hi" else ("en-IN", "IN", "IN:en")
    query = "top stories" if topic.lower() in {"top", "latest", "news"} else topic
    params = {"q": query, "hl": hl, "gl": gl, "ceid": ceid}

    try:
        async with httpx.AsyncClient(
            timeout=settings.HTTP_TIMEOUT_S,
            follow_redirects=True,
            headers={"User-Agent": "AjayAIAssistant/1.0"},
        ) as client:
            r = await client.get(settings.NEWS_RSS_URL, params=params)
            r.raise_for_status()
            root = ET.fromstring(r.content)

        items: list[dict[str, Any]] = []
        for item in root.iter("item"):
            title = _strip_html((item.findtext("title") or ""))
            if not title:
                continue
            source_el = item.find("source")
            items.append({
                "title": title.rsplit(" - ", 1)[0].strip(),
                "source": (source_el.text if source_el is not None else "")
                          or (title.rsplit(" - ", 1)[-1] if " - " in title else "News"),
                "url": item.findtext("link") or "",
                "published": item.findtext("pubDate") or "",
            })
            if len(items) >= limit:
                break

        if not items:
            return {"ok": False, "error": "No headlines found.", "topic": topic, "articles": []}

        head = items[0]["title"]
        spoken = (
            f"{topic} की मुख्य खबर: {head}। और {len(items) - 1} खबरें स्क्रीन पर हैं।"
            if language == "hi"
            else f"Top {topic} headline: {head}. I found {len(items)} stories in total."
        )
        return {"ok": True, "topic": topic, "articles": items, "spoken": spoken}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": f"News service unavailable ({type(exc).__name__}).",
                "topic": topic, "articles": []}
