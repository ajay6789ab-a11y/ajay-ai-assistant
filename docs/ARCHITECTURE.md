# Architecture

How a spoken sentence becomes an action on the phone.

---

## 1. The loop

```
 ┌── user speaks ───────────────────────────────────────────────────────────┐
 │                                                                          │
 │  🎙  speech_to_text (Android SpeechRecognizer, hi-IN / en-IN)            │
 │        │  partial results stream to the UI (live transcript + orb level) │
 │        ▼                                                                 │
 │  📝  final transcript ──► AssistantProvider.send()                       │
 │        │                                                                 │
 │        ▼                    POST /api/assistant/chat                     │
 │  ☁️   FastAPI brain ─────────────────────────────────────────────────┐   │
 │        │                                                             │   │
 │        │ 1. nlu.parse()      weighted bilingual regex → Intent       │   │
 │        │ 2. confidence ≥ .80 ? use it : ask GPT (tool calling)       │   │
 │        │ 3. run server tools (weather / news / translate / calc)     │   │
 │        │ 4. memory: auto-learn facts, bump app & contact habits      │   │
 │        │ 5. persist message + history rows                           │   │
 │        │ 6. emit { reply, intent, confidence, language, action }     │   │
 │        └─────────────────────────────────────────────────────────────┘   │
 │        ▼                                                                 │
 │  🔊  flutter_tts speaks the reply (same language, chosen voice)          │
 │  ⚡  PhoneControlService executes the action                             │
 │        └── sensitive? → ConfirmActionSheet must return true first        │
 └──────────────────────────────────────────────────────────────────────────┘
```

Median latency with the rule engine: **~40 ms** server-side (no network calls).
With GPT: whatever the model takes (typically 0.6–1.5 s), which is why device
commands never depend on it.

---

## 2. Why hybrid NLU?

| | Rule engine | LLM |
|---|---|---|
| Latency | ~1 ms | 500–2000 ms |
| Cost | 0 | per token |
| Offline | ✅ | ❌ |
| Deterministic | ✅ (testable, 104 tests) | ❌ |
| Handles "call Rahul" | ✅ | ✅ |
| Handles "what should I cook tonight?" | ❌ | ✅ |

`RULE_TRUST_THRESHOLD = 0.80` in `brain.py` is the switch. Anything the rules
score below that falls through to GPT, which returns a **structured tool call**
(`perform_action`) so even free-form chat can drive the phone.

If the LLM is unavailable the assistant still answers — `_offline_smalltalk()`
keeps it human, bilingual and honest about being offline.

---

## 3. The action contract

The single interface between brain and phone:

```jsonc
{
  "type": "CALL",                         // 26 stable action types
  "params": { "contact": "Rahul", "number": null },
  "requires_confirmation": true,          // security gate
  "confirmation_prompt": "Call Rahul now?",
  "android_intent": null,                 // e.g. android.settings.WIFI_SETTINGS
  "url": null                             // web fallback
}
```

* Defined once in `backend/app/ai/nlu.py :: ActionType`.
* Mirrored in `mobile/lib/data/models/models.dart :: ActionType`.
* Executed in `mobile/lib/services/phone_control_service.dart`.
* Contract-tested on both sides (`tests/test_nlu.py`, `test/models_test.dart`).

Unknown action strings degrade to `SPEAK_ONLY` rather than crashing, so the
backend can ship new actions before the app supports them.

---

## 4. Language handling

```
detect_language(text):
    Devanagari characters?          → hi
    ≥1 romanised Hindi marker?      → hi   (karo, kholo, batao, baje, …)
    otherwise                       → en
```

The detected language decides:
1. which reply template is used (`reply_hi` vs `reply_en`),
2. the TTS locale and voice,
3. the STT locale for the *next* turn (the app remembers what you spoke),
4. the language of tool output (weather/news are localised server-side).

An explicit Settings choice (`hi-IN` / `en-IN`) overrides detection only when
the utterance itself is script-ambiguous — so a Hindi sentence is always
answered in Hindi even if the app is set to English.

**Gotcha solved:** Devanagari vowel signs (e.g. `े` in `बजे`) are Unicode
combining marks and are *not* `\w`, so `\b` word boundaries silently fail.
The time parser uses `(?!\w)` lookaheads instead — see the comment in `nlu.py`.

---

## 5. Memory

| Kind | Example | Source |
|---|---|---|
| `fact` | `name: Ajay Kumar`, `city: Delhi` | auto-extracted from speech |
| `preference` | `favourite_city: Jaipur` | user or GPT `memory_write` |
| `habit` | `usage:app:youtube → {"count": 12}` | implicit, every action |

Habits feed `/api/assistant/suggestions`, which is why the Home screen quick
actions reorder themselves around what you actually use. Everything is
per-user, listed in Settings, and erasable with one tap.

---

## 6. Data model (SQLite, both sides)

```
users ──┬── messages     (full transcript)
        ├── history      (command log + stats)
        ├── memory       (facts, preferences, habits)   UNIQUE(user_id, key)
        ├── tasks        (to-do + planner)
        ├── reminders    (calendar + local notifications)
        ├── notes        (text & voice)
        └── settings     (JSON blob, merged over defaults)
```

`ON DELETE CASCADE` everywhere means "Delete account" is a single statement and
leaves nothing behind. The phone keeps a trimmed mirror (500 rows) so Chat and
History paint instantly and work offline.

---

## 7. Flutter app layers

```
presentation/   screens + widgets      (no business logic, no HTTP)
providers/      ChangeNotifier state   (assistant, settings, history)
services/       device capabilities    (speech, TTS, permissions, intents)
data/           models, api_client, sqflite, secure storage
core/           config, theme tokens, logger
```

`AssistantProvider` is deliberately widget-free: the consent sheet and the
snackbar are injected as callbacks (`confirmationHandler`, `onActionResult`),
which keeps it unit-testable without a widget tree.

The **AI orb** is one `CustomPainter` plus one `AnimationController` inside a
`RepaintBoundary` — 60 fps with no widget rebuilds. Its energy value is eased
(`+= (target - current) * 0.09`) so mood changes glide instead of snapping.

---

## 8. Scaling notes

* **Postgres:** swap `database.py` (the only SQL file) — routers are untouched.
* **Multiple workers:** SQLite runs in WAL mode; for >2 workers move to Postgres.
* **Streaming:** add an SSE endpoint next to `/chat`; the app already renders
  incremental text.
* **Rate limiting / quotas:** best placed at the reverse proxy, per JWT subject.
