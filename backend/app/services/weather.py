"""
Weather service backed by Open-Meteo (free, no API key, no signup).

Geocoding: https://geocoding-api.open-meteo.com/v1/search
Forecast : https://api.open-meteo.com/v1/forecast
"""

from __future__ import annotations

import re
from typing import Any

import httpx

from ..config import settings

# WMO weather interpretation codes -> (English, Hindi, emoji)
WMO: dict[int, tuple[str, str, str]] = {
    0: ("Clear sky", "साफ़ आसमान", "☀️"),
    1: ("Mainly clear", "अधिकतर साफ़", "🌤"),
    2: ("Partly cloudy", "आंशिक बादल", "⛅"),
    3: ("Overcast", "बादल छाए", "☁️"),
    45: ("Foggy", "कोहरा", "🌫"),
    48: ("Rime fog", "घना कोहरा", "🌫"),
    51: ("Light drizzle", "हल्की बूंदाबांदी", "🌦"),
    53: ("Drizzle", "बूंदाबांदी", "🌦"),
    55: ("Heavy drizzle", "तेज़ बूंदाबांदी", "🌦"),
    61: ("Light rain", "हल्की बारिश", "🌧"),
    63: ("Rain", "बारिश", "🌧"),
    65: ("Heavy rain", "तेज़ बारिश", "🌧"),
    71: ("Light snow", "हल्की बर्फ़", "🌨"),
    73: ("Snow", "बर्फ़बारी", "🌨"),
    75: ("Heavy snow", "भारी बर्फ़बारी", "❄️"),
    80: ("Rain showers", "बौछारें", "🌦"),
    81: ("Rain showers", "तेज़ बौछारें", "🌦"),
    82: ("Violent showers", "मूसलाधार बारिश", "⛈"),
    95: ("Thunderstorm", "आंधी-तूफ़ान", "⛈"),
    96: ("Thunderstorm + hail", "ओलावृष्टि", "⛈"),
    99: ("Severe thunderstorm", "भीषण तूफ़ान", "⛈"),
}


# Devanagari -> Latin for the cities Indian users actually ask about.
# Resolving locally avoids a second network round-trip and is far more reliable
# than the geocoder's Hindi index for smaller towns.
CITY_TRANSLITERATIONS: dict[str, str] = {
    "दिल्ली": "Delhi", "नई दिल्ली": "New Delhi", "मुंबई": "Mumbai", "मुम्बई": "Mumbai",
    "बंबई": "Mumbai", "कोलकाता": "Kolkata", "कलकत्ता": "Kolkata", "चेन्नई": "Chennai",
    "मद्रास": "Chennai", "बेंगलुरु": "Bengaluru", "बैंगलोर": "Bengaluru",
    "बंगलौर": "Bengaluru", "हैदराबाद": "Hyderabad", "पुणे": "Pune", "पूना": "Pune",
    "अहमदाबाद": "Ahmedabad", "जयपुर": "Jaipur", "लखनऊ": "Lucknow", "कानपुर": "Kanpur",
    "नागपुर": "Nagpur", "इंदौर": "Indore", "भोपाल": "Bhopal", "पटना": "Patna",
    "वडोदरा": "Vadodara", "सूरत": "Surat", "लुधियाना": "Ludhiana", "आगरा": "Agra",
    "नासिक": "Nashik", "वाराणसी": "Varanasi", "बनारस": "Varanasi", "श्रीनगर": "Srinagar",
    "अमृतसर": "Amritsar", "रांची": "Ranchi", "गुवाहाटी": "Guwahati", "चंडीगढ़": "Chandigarh",
    "कोयंबटूर": "Coimbatore", "जोधपुर": "Jodhpur", "मदुरै": "Madurai", "रायपुर": "Raipur",
    "कोच्चि": "Kochi", "तिरुवनंतपुरम": "Thiruvananthapuram", "देहरादून": "Dehradun",
    "शिमला": "Shimla", "गुड़गांव": "Gurugram", "गुरुग्राम": "Gurugram", "नोएडा": "Noida",
    "फरीदाबाद": "Faridabad", "गाजियाबाद": "Ghaziabad", "मेरठ": "Meerut",
    "प्रयागराज": "Prayagraj", "इलाहाबाद": "Prayagraj", "जम्मू": "Jammu",
    "उदयपुर": "Udaipur", "अजमेर": "Ajmer", "ग्वालियर": "Gwalior", "जबलपुर": "Jabalpur",
    "औरंगाबाद": "Aurangabad", "विशाखापत्तनम": "Visakhapatnam", "विजयवाड़ा": "Vijayawada",
    "मैसूर": "Mysuru", "हुबली": "Hubli", "सोलापुर": "Solapur", "बरेली": "Bareilly",
    "अलीगढ़": "Aligarh", "गोरखपुर": "Gorakhpur", "जालंधर": "Jalandhar",
    "भुवनेश्वर": "Bhubaneswar", "कटक": "Cuttack", "धनबाद": "Dhanbad",
    "जमशेदपुर": "Jamshedpur", "सिलीगुड़ी": "Siliguri", "कोटा": "Kota", "गोवा": "Goa",
    "पणजी": "Panaji", "शिलांग": "Shillong", "इंफाल": "Imphal", "आइजोल": "Aizawl",
    "गंगटोक": "Gangtok", "ईटानगर": "Itanagar", "कोहिमा": "Kohima", "अगरतला": "Agartala",
    "पुडुचेरी": "Puducherry", "तिरुचिरापल्ली": "Tiruchirappalli", "सेलम": "Salem",
    "लंदन": "London", "न्यूयॉर्क": "New York", "दुबई": "Dubai", "टोक्यो": "Tokyo",
    "पेरिस": "Paris", "सिंगापुर": "Singapore", "काठमांडू": "Kathmandu",
    "ढाका": "Dhaka", "कराची": "Karachi", "लाहौर": "Lahore", "कोलंबो": "Colombo",
}

_DEVANAGARI = re.compile(r"[\u0900-\u097F]")


def normalise_city(city: str) -> str:
    """Map a Devanagari city name to its Latin form when we know it."""
    key = (city or "").strip()
    return CITY_TRANSLITERATIONS.get(key, key)


async def geocode(city: str) -> dict[str, Any] | None:
    """Resolve a city name to coordinates.

    Handles Hindi input three ways, cheapest first:
      1. a local Devanagari -> Latin lookup table,
      2. the normal English-language geocoder query,
      3. a retry with ``language=hi`` for Devanagari names we don't have mapped.
    """
    original = (city or "").strip()
    candidate = normalise_city(original)
    # A Hindi speaker asking for "कोच्चि" means Kochi in Kerala, not Kochi in Japan.
    prefer_india = bool(_DEVANAGARI.search(original))

    async def _query(name: str, language: str, country: str | None = None) -> list[dict[str, Any]]:
        params: dict[str, Any] = {
            "name": name, "count": 5, "language": language, "format": "json",
        }
        if country:
            params["countryCode"] = country
        async with httpx.AsyncClient(timeout=settings.HTTP_TIMEOUT_S) as client:
            r = await client.get(settings.WEATHER_GEO_URL, params=params)
            r.raise_for_status()
            return (r.json() or {}).get("results") or []

    results: list[dict[str, Any]] = []
    if prefer_india:
        results = await _query(candidate, "en", country="IN")
    if not results:
        results = await _query(candidate, "en")
    # Unmapped Devanagari name: the Hindi index can still resolve it.
    if not results and _DEVANAGARI.search(candidate):
        results = await _query(candidate, "hi")
    if not results:
        return None

    # Prefer an Indian match for Hindi queries, then the most populous place —
    # "Delhi" should mean the metro, not a village that happens to rank first.
    def _rank(hit: dict[str, Any]) -> tuple[int, int]:
        india = 1 if (prefer_india and hit.get("country_code") == "IN") else 0
        return (india, hit.get("population") or 0)

    hit = max(results, key=_rank)
    return {
        "name": hit.get("name"),
        "country": hit.get("country"),
        "admin1": hit.get("admin1"),
        "lat": hit.get("latitude"),
        "lon": hit.get("longitude"),
    }


async def get_weather(city: str = "Delhi", language: str = "en") -> dict[str, Any]:
    """Current conditions + a 3-day outlook, formatted for speech."""
    try:
        place = await geocode(city)
        if not place:
            return {"ok": False, "error": f"I couldn't find {city}."}

        params = {
            "latitude": place["lat"],
            "longitude": place["lon"],
            "current": "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m",
            "daily": "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
            "timezone": "auto",
            "forecast_days": 3,
        }
        async with httpx.AsyncClient(timeout=settings.HTTP_TIMEOUT_S) as client:
            r = await client.get(settings.WEATHER_URL, params=params)
            r.raise_for_status()
            data = r.json()

        cur = data.get("current", {})
        daily = data.get("daily", {})
        code = int(cur.get("weather_code", 0))
        desc_en, desc_hi, icon = WMO.get(code, ("Clear", "साफ़", "🌤"))
        temp = round(float(cur.get("temperature_2m", 0)))
        feels = round(float(cur.get("apparent_temperature", temp)))
        city_name = place["name"]

        spoken = (
            f"{city_name} में अभी {temp} डिग्री, {desc_hi}। महसूस {feels} डिग्री जैसा हो रहा है।"
            if language == "hi"
            else f"It's {temp}°C in {city_name} with {desc_en.lower()}, feels like {feels}°C."
        )
        forecast = [
            {
                "date": d,
                "max": round(float(mx)),
                "min": round(float(mn)),
                "code": int(c),
                "icon": WMO.get(int(c), ("", "", "🌤"))[2],
                "rain_chance": p,
            }
            for d, mx, mn, c, p in zip(
                daily.get("time", []),
                daily.get("temperature_2m_max", []),
                daily.get("temperature_2m_min", []),
                daily.get("weather_code", []),
                daily.get("precipitation_probability_max", []),
            )
        ]
        return {
            "ok": True,
            "city": city_name,
            "country": place.get("country"),
            "temp_c": temp,
            "feels_like_c": feels,
            "humidity": cur.get("relative_humidity_2m"),
            "wind_kph": cur.get("wind_speed_10m"),
            "description": desc_hi if language == "hi" else desc_en,
            "icon": icon,
            "forecast": forecast,
            "spoken": spoken,
        }
    except Exception as exc:  # noqa: BLE001 - network failures must not 500
        return {"ok": False, "error": f"Weather service unavailable ({type(exc).__name__})."}
