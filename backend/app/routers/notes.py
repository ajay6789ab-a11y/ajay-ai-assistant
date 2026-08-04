"""Text + voice note routes."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query

from ..database import execute, new_id, query, query_one, utcnow
from ..schemas import NoteIn
from ..security import current_user

router = APIRouter(prefix="/api/notes", tags=["notes"])


@router.get("")
def list_notes(
    q: str | None = Query(None),
    user: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    sql = "SELECT * FROM notes WHERE user_id=?"
    params: list[Any] = [user["id"]]
    if q:
        sql += " AND (title LIKE ? OR body LIKE ?)"
        params += [f"%{q}%", f"%{q}%"]
    sql += " ORDER BY pinned DESC, created_at DESC"
    return {"items": query(sql, tuple(params))}


@router.post("", status_code=201)
def create_note(body: NoteIn, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    nid = new_id()
    execute(
        "INSERT INTO notes(id, user_id, title, body, audio_path, pinned, created_at) "
        "VALUES(?,?,?,?,?,?,?)",
        (nid, user["id"], body.title or body.body[:40], body.body, body.audio_path,
         int(body.pinned), utcnow()),
    )
    return query_one("SELECT * FROM notes WHERE id=?", (nid,)) or {}


@router.post("/{note_id}/pin")
def toggle_pin(note_id: str, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    execute("UPDATE notes SET pinned = 1 - pinned WHERE id=? AND user_id=?", (note_id, user["id"]))
    return query_one("SELECT * FROM notes WHERE id=?", (note_id,)) or {}


@router.delete("/{note_id}")
def delete_note(note_id: str, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    return {"deleted": execute("DELETE FROM notes WHERE id=? AND user_id=?", (note_id, user["id"]))}
