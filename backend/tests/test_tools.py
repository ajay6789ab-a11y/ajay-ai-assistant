"""Tests for the smart-assistant tools (calculator is fully offline)."""

from __future__ import annotations

import pytest

from app.services import calculator, translate


@pytest.mark.parametrize(
    "expression,expected",
    [
        ("2+2", 4),
        ("25 * 4 + 10", 110),
        ("(8 + 2) / 4", 2.5),
        ("2 ^ 10", 1024),
        ("sqrt(144)", 12),
        ("20 percent of 500", 100),
        ("five plus three", 8),
    ],
)
def test_calculator(expression: str, expected: float) -> None:
    out = calculator.calculate(expression)
    assert out["ok"] is True, out
    assert out["result"] == expected


@pytest.mark.parametrize(
    "expression",
    ["import os", "__import__('os')", "open('/etc/passwd')", "1/0", "hello world"],
)
def test_calculator_is_safe(expression: str) -> None:
    assert calculator.calculate(expression)["ok"] is False


def test_language_code_resolution() -> None:
    assert translate.resolve_lang("Hindi") == "hi"
    assert translate.resolve_lang("हिंदी") == "hi"
    assert translate.resolve_lang("french") == "fr"
    assert translate.resolve_lang(None) == "hi"


@pytest.mark.asyncio
async def test_translate_offline_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    """With the network down we still answer common phrases from the phrasebook."""
    class _Boom:
        def __init__(self, *a, **k): ...
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False
        async def get(self, *a, **k): raise RuntimeError("offline")

    monkeypatch.setattr(translate.httpx, "AsyncClient", _Boom)
    out = await translate.translate("good morning", "hi")
    assert out["ok"] is True
    assert out["translated"] == "सुप्रभात"
    assert out["engine"] == "offline"


# ---------------------------------------------------------------------------
# Regression: Hindi city names must resolve, and must resolve to the *Indian*
# city. "कोच्चि" previously geocoded to Kochi, Japan; Devanagari names sent to
# the English geocoder index returned nothing at all.
# ---------------------------------------------------------------------------
from app.services import weather as weather_svc  # noqa: E402


@pytest.mark.parametrize(
    "hindi,latin",
    [
        ("दिल्ली", "Delhi"),
        ("मुंबई", "Mumbai"),
        ("बेंगलुरु", "Bengaluru"),
        ("कोलकाता", "Kolkata"),
        ("कोच्चि", "Kochi"),
        ("न्यूयॉर्क", "New York"),
    ],
)
def test_city_transliteration(hindi: str, latin: str) -> None:
    assert weather_svc.normalise_city(hindi) == latin


def test_normalise_city_passes_through_latin() -> None:
    assert weather_svc.normalise_city("Delhi") == "Delhi"
    assert weather_svc.normalise_city("Reykjavik") == "Reykjavik"


@pytest.mark.asyncio
async def test_geocode_prefers_indian_city_for_hindi_query() -> None:
    """कोच्चि is Kochi, Kerala — not the same-named city in Japan."""
    hit = await weather_svc.geocode("कोच्चि")
    assert hit is not None
    assert hit["country"] == "India"
    assert 9.0 < hit["lat"] < 11.0        # Kerala, not Shikoku


@pytest.mark.asyncio
async def test_geocode_hindi_delhi() -> None:
    hit = await weather_svc.geocode("दिल्ली")
    assert hit is not None
    assert hit["country"] == "India"
    assert 28.0 < hit["lat"] < 29.5


@pytest.mark.asyncio
async def test_geocode_non_indian_city_still_works() -> None:
    hit = await weather_svc.geocode("London")
    assert hit is not None
    assert hit["country"] == "United Kingdom"
