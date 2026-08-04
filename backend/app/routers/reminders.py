"""Calendar reminder routes (mirrored to local notifications on the phone)."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, Query

from ..database import execute, new_id, query, query_one, utcnow
from ..schemas import ReminderIn
from ..security import current_user

router = APIRouter(prefix="/api/reminders", tags=["reminders"])


@router.get("")
def list_reminders(
    upcoming_only: bool = Query(False),
    user: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    sql = "SELECT * FROM reminders WHERE user_id=?"
    params: list[Any] = [user["id"]]
    if upcoming_only:
        sql += " AND fired=0"
    sql += " ORDER BY remind_at ASC"
    return {"items": query(sql, tuple(params))}


@router.post("", status_code=201)
def create_reminder(body: ReminderIn, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    rid = new_id()
    execute(
        "INSERT INTO reminders(id, user_id, title, remind_at, repeat, fired, created_at) "
        "VALUES(?,?,?,?,?,0,?)",
        (rid, user["id"], body.title, body.remind_at, body.repeat, utcnow()),
    )
    return query_one("SELECT * FROM reminders WHERE id=?", (rid,)) or {}


@router.post("/{reminder_id}/done")
def mark_fired(reminder_id: str, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    """Mark as fired; daily/weekly reminders roll forward automatically."""
    row = query_one("SELECT * FROM reminders WHERE id=? AND user_id=?", (reminder_id, user["id"]))
    if not row:
        return {"updated": 0}
    if row["repeat"] in {"daily", "weekly"}:
        delta = timedelta(days=1 if row["repeat"] == "daily" else 7)
        try:
            nxt = (datetime.fromisoformat(row["remind_at"]) + delta).isoformat(timespec="seconds")
        except ValueError:
            nxt = (datetime.now() + delta).isoformat(timespec="seconds")
        execute("UPDATE reminders SET remind_at=?, fired=0 WHERE id=?", (nxt, reminder_id))
        return {"updated": 1, "next": nxt}
    execute("UPDATE reminders SET fired=1 WHERE id=?", (reminder_id,))
    return {"updated": 1}


@router.delete("/{reminder_id}")
def delete_reminder(reminder_id: str, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    return {"deleted": execute("DELETE FROM reminders WHERE id=? AND user_id=?",
                               (reminder_id, user["id"]))}
