"""Memory routes — what the assistant remembers about the user."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends

from ..ai import memory as memory_store
from ..schemas import MemoryIn
from ..security import current_user

router = APIRouter(prefix="/api/memory", tags=["memory"])


@router.get("")
def list_memory(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    items = [m for m in memory_store.recall_all(user["id"], 200)
             if not m["key"].startswith("usage:")]
    habits = {
        "apps": memory_store.top_usage(user["id"], "app", 5),
        "contacts": memory_store.top_usage(user["id"], "contact", 5),
    }
    return {"items": items, "habits": habits}


@router.post("", status_code=201)
def add_memory(body: MemoryIn, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    return memory_store.remember(user["id"], body.key, body.value, body.kind)


@router.delete("/{key}")
def delete_memory(key: str, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    return {"deleted": memory_store.forget(user["id"], key)}


@router.delete("")
def wipe_memory(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    """Privacy control: erase everything the assistant has learned."""
    return {"deleted": memory_store.forget_all(user["id"])}
