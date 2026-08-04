"""Standalone smart-assistant tools (also callable directly from the UI)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query

from ..services import calculator, news, translate, weather
from ..security import current_user

router = APIRouter(prefix="/api/tools", tags=["tools"])


@router.get("/weather")
async def weather_endpoint(
    city: str = Query("Delhi", min_length=2, max_length=60),
    language: str = Query("en", pattern="^(en|hi)$"),
    _: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    return await weather.get_weather(city, language)


@router.get("/news")
async def news_endpoint(
    topic: str = Query("top", max_length=80),
    language: str = Query("en", pattern="^(en|hi)$"),
    limit: int = Query(6, ge=1, le=20),
    _: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    return await news.get_news(topic, language, limit)


@router.get("/translate")
async def translate_endpoint(
    text: str = Query(..., min_length=1, max_length=1000),
    target: str = Query("hi"),
    source: str | None = Query(None),
    _: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    return await translate.translate(text, target, source)


@router.get("/calculate")
def calculate_endpoint(
    expression: str = Query(..., min_length=1, max_length=200),
    _: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    return calculator.calculate(expression)
