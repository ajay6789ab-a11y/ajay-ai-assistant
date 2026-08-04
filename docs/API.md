# API Reference

Base URL: `http://localhost:8000` · Interactive docs: `/docs` · OpenAPI: `/openapi.json`

All endpoints except `/api/health` and `/api/auth/*` require:

```
Authorization: Bearer <jwt>
```

---

## Auth

### `POST /api/auth/guest`
Anonymous per-device account (what the mobile app uses on first launch).

```json
{ "device_id": "and-9f2c…", "name": "Friend" }
```
→ `200`
```json
{
  "access_token": "eyJhbGciOi…",
  "token_type": "bearer",
  "user": { "id": "…", "name": "Friend", "is_guest": true }
}
```

### `POST /api/auth/register` → `201`
`{ "name": "Ajay", "email": "a@b.com", "password": "secret123" }`
Passwords are hashed with **Argon2id**. Duplicate email → `409`.

### `POST /api/auth/login`
`{ "email": "a@b.com", "password": "secret123" }` → same shape as above. Bad
credentials → `401` (no user enumeration).

### `GET /api/auth/me`
Current profile.

---

## Assistant

### `POST /api/assistant/chat`  ★ the main endpoint

```json
{
  "text": "Call Rahul",
  "source": "voice",              // voice | text | quick_action
  "language": null,               // "hi" | "en" | null (auto-detect)
  "client_time": "2026-08-04T19:30:00+05:30",
  "location": "Delhi"             // optional, improves weather/news
}
```

→ `200`
```json
{
  "reply": "Calling Rahul. Shall I dial now?",
  "intent": "call",
  "confidence": 0.95,
  "language": "en",
  "action": {
    "type": "CALL",
    "params": { "contact": "Rahul", "number": null },
    "requires_confirmation": true,
    "confirmation_prompt": "Call Rahul now?",
    "android_intent": null,
    "url": null
  },
  "speak": true,
  "data": {},
  "message_id": "3f9c…",
  "engine": "rules"               // "rules" | "llm"
}
```

`data` carries tool output when relevant:

```json
"data": { "weather": { "ok": true, "city": "Delhi", "temp_c": 29,
                       "description": "Overcast", "icon": "☁️",
                       "forecast": [ … ], "spoken": "It's 29°C in Delhi…" } }
```

### `POST /api/assistant/intent`
Rules-only parse, **no side effects** — used for offline mode and previews.

### `GET /api/assistant/conversation?limit=50`
Full transcript, oldest → newest.

### `DELETE /api/assistant/conversation`
Wipes the transcript.

### `GET /api/assistant/suggestions`
Quick-action chips, reordered by learned habits.

---

## History

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/history?q=&intent=&limit=100&offset=0` | Search commands + replies |
| `GET` | `/api/history/stats` | Totals, top intents, 7-day series, voice vs text |
| `DELETE` | `/api/history/{id}` | Remove one entry |
| `DELETE` | `/api/history` | Clear all |

---

## Tasks & planner

| Method | Path | Body |
|---|---|---|
| `GET` | `/api/tasks?done=false` | — |
| `POST` | `/api/tasks` | `{ "title": "Buy milk", "priority": 2, "due_at": "…" }` |
| `PATCH` | `/api/tasks/{id}` | `{ "done": true }` |
| `DELETE` | `/api/tasks/{id}` | — |
| `GET` | `/api/tasks/planner/today` | Open tasks + next-24 h reminders + `spoken` summary |

## Reminders

| `GET` | `/api/reminders?upcoming_only=true` |
| `POST` | `/api/reminders` — `{ "title": "Standup", "remind_at": "2026-08-05T09:30:00", "repeat": "daily" }` |
| `POST` | `/api/reminders/{id}/done` — repeating ones roll forward automatically |
| `DELETE` | `/api/reminders/{id}` |

## Notes

| `GET` | `/api/notes?q=milk` |
| `POST` | `/api/notes` — `{ "body": "…", "title": "…", "audio_path": "…" }` |
| `POST` | `/api/notes/{id}/pin` |
| `DELETE` | `/api/notes/{id}` |

---

## Memory

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/memory` | `items` (facts/preferences) + `habits` (top apps & contacts) |
| `POST` | `/api/memory` | `{ "key": "favourite_city", "value": "Jaipur" }` |
| `DELETE` | `/api/memory/{key}` | Forget one thing |
| `DELETE` | `/api/memory` | Forget everything |

---

## Settings

### `GET /api/settings`
Returns `settings`, `defaults`, the `voices` catalogue and `languages`.

### `PATCH /api/settings`
Any subset of:
`language, voice, speech_rate, pitch, wake_word_enabled, haptics,
auto_speak_replies, confirm_calls, confirm_messages, save_history,
personalised_memory, analytics, theme`

### `DELETE /api/settings/account`
Right to erasure — cascades across every table.

---

## Tools (also used internally by the brain)

| Endpoint | Example | Provider |
|---|---|---|
| `GET /api/tools/weather?city=Delhi&language=hi` | live temp + 3-day outlook | Open-Meteo (keyless) |
| `GET /api/tools/news?topic=cricket&limit=6` | headlines + sources | Google News RSS (keyless) |
| `GET /api/tools/translate?text=good+morning&target=hi` | `सुप्रभात` | MyMemory + offline phrasebook |
| `GET /api/tools/calculate?expression=25*4+10` | `110` | AST evaluator (no `eval`) |

---

## System

### `GET /api/health`
```json
{ "status": "ok", "version": "1.0.0", "ai_engine": "rules",
  "model": null, "features": { "hindi": true, "phone_control": true, … } }
```

---

## Errors

| Code | Meaning |
|---|---|
| `401` | Missing/expired token — the app silently re-authenticates once |
| `404` | Object not found or not yours |
| `409` | Email already registered |
| `422` | Validation error (Pydantic detail) |
| `500` | Generic message only; stack traces never leave the server |

Every response also carries `X-Response-Time-ms`.
