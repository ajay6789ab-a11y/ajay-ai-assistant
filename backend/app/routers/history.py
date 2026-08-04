"""Command-history routes (History screen: list, search, stats, delete)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query

from ..database import execute, query
from ..security import current_user

router = APIRouter(prefix="/api/history", tags=["history"])


@router.get("")
def list_history(
    q: str | None = Query(None, description="Full-text search over commands and replies"),
    intent: str | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    user: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    sql = "SELECT * FROM history WHERE user_id=?"
    params: list[Any] = [user["id"]]
    if q:
        sql += " AND (command LIKE ? OR reply LIKE ?)"
        params += [f"%{q}%", f"%{q}%"]
    if intent:
        sql += " AND intent=?"
        params.append(intent)
    sql += " ORDER BY created_at DESC, rowid DESC LIMIT ? OFFSET ?"
    params += [limit, offset]
    items = query(sql, tuple(params))
    return {"items": items, "count": len(items)}


@router.get("/stats")
def stats(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    """Small analytics block shown at the top of the History screen."""
    total = query("SELECT COUNT(*) AS c FROM history WHERE user_id=?", (user["id"],))[0]["c"]
    by_intent = query(
        "SELECT intent, COUNT(*) AS c FROM history WHERE user_id=? GROUP BY intent "
        "ORDER BY c DESC LIMIT 8",
        (user["id"],),
    )
    by_day = query(
        "SELECT substr(created_at,1,10) AS day, COUNT(*) AS c FROM history WHERE user_id=? "
        "GROUP BY day ORDER BY day DESC LIMIT 7",
        (user["id"],),
    )
    voice = query(
        "SELECT source, COUNT(*) AS c FROM history WHERE user_id=? GROUP BY source",
        (user["id"],),
    )
    return {"total": total, "by_intent": by_intent, "by_day": list(reversed(by_day)),
            "by_source": voice}


@router.delete("/{item_id}")
def delete_item(item_id: str, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    return {"deleted": execute("DELETE FROM history WHERE id=? AND user_id=?", (item_id, user["id"]))}


@router.delete("")
def clear_history(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    return {"deleted": execute("DELETE FROM history WHERE user_id=?", (user["id"],))}
