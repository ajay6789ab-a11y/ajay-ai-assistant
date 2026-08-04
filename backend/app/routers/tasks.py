"""To-do list + daily planner routes."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

from ..database import execute, new_id, query, query_one, utcnow
from ..schemas import TaskIn, TaskPatch
from ..security import current_user

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


@router.get("")
def list_tasks(
    done: bool | None = Query(None),
    user: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    sql = "SELECT * FROM tasks WHERE user_id=?"
    params: list[Any] = [user["id"]]
    if done is not None:
        sql += " AND done=?"
        params.append(int(done))
    sql += " ORDER BY done ASC, priority DESC, COALESCE(due_at,'9999') ASC, created_at DESC"
    return {"items": query(sql, tuple(params))}


@router.post("", status_code=201)
def create_task(body: TaskIn, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    tid = new_id()
    execute(
        "INSERT INTO tasks(id, user_id, title, notes, due_at, priority, done, created_at) "
        "VALUES(?,?,?,?,?,?,0,?)",
        (tid, user["id"], body.title, body.notes, body.due_at, body.priority, utcnow()),
    )
    return query_one("SELECT * FROM tasks WHERE id=?", (tid,)) or {}


@router.patch("/{task_id}")
def update_task(task_id: str, body: TaskPatch,
                user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    existing = query_one("SELECT * FROM tasks WHERE id=? AND user_id=?", (task_id, user["id"]))
    if not existing:
        raise HTTPException(404, "Task not found")
    fields = body.model_dump(exclude_none=True)
    if not fields:
        return existing
    if "done" in fields:
        fields["done"] = int(bool(fields["done"]))
    sets = ", ".join(f"{k}=?" for k in fields)
    execute(f"UPDATE tasks SET {sets} WHERE id=? AND user_id=?",
            (*fields.values(), task_id, user["id"]))
    return query_one("SELECT * FROM tasks WHERE id=?", (task_id,)) or {}


@router.delete("/{task_id}")
def delete_task(task_id: str, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    return {"deleted": execute("DELETE FROM tasks WHERE id=? AND user_id=?", (task_id, user["id"]))}


@router.get("/planner/today")
def planner(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    """
    Daily planner = open tasks + reminders due in the next 24h, plus a spoken
    one-liner the assistant can read out ("You have 3 tasks and 1 reminder…").
    """
    today = date.today().isoformat()
    tomorrow = (datetime.now() + timedelta(days=1)).isoformat(timespec="seconds")

    tasks = query(
        "SELECT * FROM tasks WHERE user_id=? AND done=0 ORDER BY priority DESC, "
        "COALESCE(due_at,'9999') ASC LIMIT 20",
        (user["id"],),
    )
    reminders = query(
        "SELECT * FROM reminders WHERE user_id=? AND fired=0 AND remind_at<=? "
        "ORDER BY remind_at ASC LIMIT 20",
        (user["id"], tomorrow),
    )
    done_today = query(
        "SELECT COUNT(*) AS c FROM tasks WHERE user_id=? AND done=1 AND substr(created_at,1,10)=?",
        (user["id"], today),
    )[0]["c"]

    spoken = (
        f"You have {len(tasks)} open task{'s' if len(tasks) != 1 else ''} "
        f"and {len(reminders)} reminder{'s' if len(reminders) != 1 else ''} coming up."
        if (tasks or reminders) else "Your day is clear — nothing scheduled."
    )
    return {"date": today, "tasks": tasks, "reminders": reminders,
            "completed_today": done_today, "spoken": spoken}
