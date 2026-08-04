# Security & Privacy

The assistant can dial numbers, read your contacts and hear your voice. That
demands a higher bar than a normal app. This is the model we implemented.

---

## 1. Consent before consequence

Two independent gates protect every sensitive action:

1. **The Android runtime permission** (`CALL_PHONE`, `READ_CONTACTS`, `SEND_SMS`,
   `RECORD_AUDIO`, `READ_MEDIA_IMAGES`, `POST_NOTIFICATIONS`) — requested *in
   context*, never at install time, never pre-emptively.
2. **The in-app consent sheet** — even with the OS permission granted, calls and
   messages show exactly *who* is being contacted, *what* will be sent and which
   permission is involved. Nothing happens until the user taps **Allow**.

The backend flags this in the action contract:

```json
"requires_confirmation": true,
"confirmation_prompt": "Call Rahul now?"
```

and the client refuses to execute `CALL` / `SMS` / `WHATSAPP` without an
approval callback returning `true` (`AssistantProvider._runAction`).

Messages are **never sent silently** — the composer opens pre-filled and the
user presses send. Both gates can be tightened further in Settings, and are on
by default.

---

## 2. Authentication

| Concern | Implementation |
|---|---|
| Password storage | **Argon2id** (`argon2-cffi`), memory-hard, per-password salt |
| Sessions | **JWT HS256**, `sub` + `iat` + `exp` + `iss`, 30-day default TTL |
| Token at rest | Android **Keystore** via `flutter_secure_storage` (`encryptedSharedPreferences`) |
| Anonymous use | Random per-install device id — **never** IMEI/MAC/Android ID |
| User enumeration | Login returns one generic `401` for both wrong email and wrong password |
| Expiry handling | The client silently re-authenticates once, then surfaces an error |

`JWT_SECRET` must be replaced in production (`openssl rand -hex 32`).

---

## 3. Data isolation

Every table carries `user_id`, every query filters on the authenticated
subject, and foreign keys use `ON DELETE CASCADE`. There is a regression test
for this (`test_users_are_isolated`): user B can never read user A's notes.

---

## 4. What leaves the phone

| Data | Sent to backend | Sent to the LLM |
|---|---|---|
| Transcribed command text | ✅ | only when confidence < 0.80 |
| Raw audio | ❌ never | ❌ never |
| Contact list | ❌ never | ❌ never |
| Contact *name* in a command | ✅ (to build the action) | only in that sentence |
| Phone number | resolved on-device where possible | ❌ |
| Memories (name, city, prefs) | ✅ | ✅ as a compact context block |
| Photos / files | ❌ | ❌ |
| Location | only a city string, if you ask for weather | ❌ |

Speech recognition uses the platform recogniser; audio never touches our server.
With **no** `OPENAI_API_KEY` configured, *nothing at all* is sent to a third-party
model — the rule engine handles everything locally.

---

## 5. Privacy controls in the app

- **Save command history** — off ⇒ nothing is logged.
- **Personalised memory** — off ⇒ no facts or habits are learned.
- **Erase all memories** — one tap, immediate.
- **Clear command history** — one tap.
- **Delete account & all data** — cascades server-side, wipes the local SQLite
  database and the Keystore entries. Nothing is retained.

Android backups are disabled (`allowBackup=false`, explicit
`data_extraction_rules.xml`), so conversations never land in Google Drive or a
device-to-device transfer.

---

## 6. Input safety

| Vector | Mitigation |
|---|---|
| Calculator expressions | AST whitelist — no `eval`, no imports, no attribute access. Tested against `__import__('os').system('ls')` |
| SQL injection | Parameterised queries everywhere; no string interpolation of user input |
| XSS in the web demo | All dynamic text passes through an `esc()` escaper |
| Oversized payloads | Pydantic `max_length` on every free-text field |
| Prompt injection | The LLM can only act through the `perform_action` tool schema; sensitive types still require the consent sheet, so a malicious prompt cannot silently dial |
| Stack-trace leakage | A global exception handler returns a generic message; details stay in server logs |

---

## 7. Transport

- Production traffic is HTTPS-only; `usesCleartextTraffic=false`.
- `network_security_config.xml` allows cleartext **only** for `10.0.2.2`,
  `localhost` and private `192.168.*` ranges so local development works.
- Security headers on every response: `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: no-referrer`, and `X-Frame-Options: SAMEORIGIN` when
  `DEBUG=false`.
- CORS defaults to `*` for development — **restrict `CORS_ORIGINS` in production.**

---

## 8. Logging

`AppLogger` is a no-op in release builds. We never log transcripts, contact
names, tokens or memory values. Server logs record method, path and latency —
not payloads.

---

## 9. Pre-launch checklist

- [ ] `JWT_SECRET` rotated; `DEBUG=false`
- [ ] `CORS_ORIGINS` restricted
- [ ] TLS enforced end-to-end
- [ ] Rate limiting at the proxy (per IP and per JWT subject)
- [ ] Play Store data-safety form filled to match §4
- [ ] Privacy policy published (required: the app requests `CALL_PHONE`/`SEND_SMS`)
- [ ] Penetration test of `/api/assistant/chat` with adversarial prompts
- [ ] Dependency scan (`pip-audit`, `flutter pub outdated`)
