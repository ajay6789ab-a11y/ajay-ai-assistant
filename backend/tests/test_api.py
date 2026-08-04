"""End-to-end API tests against a throwaway SQLite database."""

from __future__ import annotations

import os
import tempfile

import pytest

# Point the app at a temp DB *before* importing it.
_TMP = tempfile.mkdtemp(prefix="ajay-test-")
os.environ["DB_PATH"] = os.path.join(_TMP, "test.db")
os.environ["JWT_SECRET"] = "test-secret"
os.environ["OPENAI_API_KEY"] = ""            # force the offline rule engine

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture(scope="module")
def client() -> TestClient:
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def auth(client: TestClient) -> dict[str, str]:
    r = client.post("/api/auth/guest", json={"device_id": "test-device-0001", "name": "Ajay"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


# ------------------------------------------------------------------ system
def test_health(client: TestClient) -> None:
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_protected_route_requires_token(client: TestClient) -> None:
    assert client.get("/api/history").status_code == 401


# -------------------------------------------------------------------- auth
def test_register_and_login(client: TestClient) -> None:
    payload = {"name": "Test User", "email": "test@example.com", "password": "secret123"}
    r = client.post("/api/auth/register", json=payload)
    assert r.status_code == 201, r.text
    assert "access_token" in r.json()

    # duplicate email rejected
    assert client.post("/api/auth/register", json=payload).status_code == 409

    r = client.post("/api/auth/login", json={"email": "test@example.com", "password": "secret123"})
    assert r.status_code == 200
    assert client.post("/api/auth/login",
                       json={"email": "test@example.com", "password": "wrong"}).status_code == 401


def test_password_never_returned(client: TestClient) -> None:
    r = client.post("/api/auth/register",
                    json={"name": "P", "email": "p@example.com", "password": "secret123"})
    assert "password" not in r.text and "hash" not in r.text


# --------------------------------------------------------------- assistant
def test_chat_call_flow_requires_confirmation(client: TestClient, auth: dict[str, str]) -> None:
    r = client.post("/api/assistant/chat", json={"text": "Call Rahul", "source": "voice"}, headers=auth)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["action"]["type"] == "CALL"
    assert body["action"]["requires_confirmation"] is True
    assert body["action"]["params"]["contact"] == "Rahul"
    assert body["engine"] == "rules"


def test_chat_hindi(client: TestClient, auth: dict[str, str]) -> None:
    r = client.post("/api/assistant/chat", json={"text": "यूट्यूब खोलो"}, headers=auth)
    body = r.json()
    assert body["action"]["type"] == "OPEN_APP"
    assert body["language"] == "hi"


def test_chat_creates_task_row(client: TestClient, auth: dict[str, str]) -> None:
    client.post("/api/assistant/chat", json={"text": "add task buy milk"}, headers=auth)
    items = client.get("/api/tasks", headers=auth).json()["items"]
    assert any("Milk" in t["title"] for t in items)


def test_intent_preview_has_no_side_effects(client: TestClient, auth: dict[str, str]) -> None:
    before = len(client.get("/api/history", headers=auth).json()["items"])
    r = client.post("/api/assistant/intent", json={"text": "Open camera"}, headers=auth)
    assert r.json()["action"]["type"] == "OPEN_CAMERA"
    after = len(client.get("/api/history", headers=auth).json()["items"])
    assert before == after


def test_conversation_persisted(client: TestClient, auth: dict[str, str]) -> None:
    msgs = client.get("/api/assistant/conversation", headers=auth).json()["messages"]
    assert len(msgs) >= 2
    assert msgs[0]["role"] in {"user", "assistant"}


def test_suggestions_personalise(client: TestClient, auth: dict[str, str]) -> None:
    for _ in range(3):
        client.post("/api/assistant/chat", json={"text": "open instagram"}, headers=auth)
    labels = [s["label"] for s in client.get("/api/assistant/suggestions", headers=auth).json()["suggestions"]]
    assert "Instagram" in labels


# ----------------------------------------------------------------- history
def test_history_search_and_stats(client: TestClient, auth: dict[str, str]) -> None:
    r = client.get("/api/history", params={"q": "Rahul"}, headers=auth)
    assert r.status_code == 200 and r.json()["count"] >= 1
    stats = client.get("/api/history/stats", headers=auth).json()
    assert stats["total"] >= 1 and isinstance(stats["by_intent"], list)


# ------------------------------------------------------- tasks / notes etc
def test_task_crud(client: TestClient, auth: dict[str, str]) -> None:
    created = client.post("/api/tasks", json={"title": "Ship the MVP", "priority": 2}, headers=auth).json()
    tid = created["id"]
    patched = client.patch(f"/api/tasks/{tid}", json={"done": True}, headers=auth).json()
    assert patched["done"] == 1
    assert client.delete(f"/api/tasks/{tid}", headers=auth).json()["deleted"] == 1


def test_notes_and_reminders(client: TestClient, auth: dict[str, str]) -> None:
    note = client.post("/api/notes", json={"body": "Remember the milk"}, headers=auth).json()
    assert note["body"] == "Remember the milk"
    rem = client.post("/api/reminders",
                      json={"title": "Standup", "remind_at": "2026-08-05T09:30:00"},
                      headers=auth).json()
    assert rem["title"] == "Standup"
    planner = client.get("/api/tasks/planner/today", headers=auth).json()
    assert "spoken" in planner


# ------------------------------------------------------------------ memory
def test_memory_roundtrip_and_wipe(client: TestClient, auth: dict[str, str]) -> None:
    client.post("/api/memory", json={"key": "favourite_city", "value": "Jaipur"}, headers=auth)
    items = client.get("/api/memory", headers=auth).json()["items"]
    assert any(m["key"] == "favourite_city" for m in items)
    assert client.delete("/api/memory/favourite_city", headers=auth).json()["deleted"] == 1


def test_memory_auto_learned_from_speech(client: TestClient, auth: dict[str, str]) -> None:
    client.post("/api/assistant/chat", json={"text": "my name is Ajay Kumar"}, headers=auth)
    items = client.get("/api/memory", headers=auth).json()["items"]
    assert any(m["key"] == "name" and "Ajay" in m["value"] for m in items)


# ---------------------------------------------------------------- settings
def test_settings_update(client: TestClient, auth: dict[str, str]) -> None:
    r = client.patch("/api/settings", json={"voice": "male_deep", "language": "hi-IN"}, headers=auth)
    s = r.json()["settings"]
    assert s["voice"] == "male_deep" and s["language"] == "hi-IN"
    assert client.get("/api/settings", headers=auth).json()["settings"]["voice"] == "male_deep"


def test_users_are_isolated(client: TestClient) -> None:
    a = client.post("/api/auth/guest", json={"device_id": "device-A"}).json()["access_token"]
    b = client.post("/api/auth/guest", json={"device_id": "device-B"}).json()["access_token"]
    client.post("/api/notes", json={"body": "A secret"}, headers={"Authorization": f"Bearer {a}"})
    b_notes = client.get("/api/notes", headers={"Authorization": f"Bearer {b}"}).json()["items"]
    assert all("A secret" not in n["body"] for n in b_notes)


# ------------------------------------------------------------------- tools
def test_calculator_tool(client: TestClient, auth: dict[str, str]) -> None:
    r = client.get("/api/tools/calculate", params={"expression": "25*4+10"}, headers=auth)
    assert r.json()["result"] == 110


def test_calculator_rejects_code_injection(client: TestClient, auth: dict[str, str]) -> None:
    r = client.get("/api/tools/calculate",
                   params={"expression": "__import__('os').system('ls')"}, headers=auth)
    assert r.json()["ok"] is False
