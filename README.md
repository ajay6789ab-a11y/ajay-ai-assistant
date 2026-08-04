<div align="center">

# 🔮 Ajay AI Assistant

**A futuristic, voice-controlled AI assistant for Android — speaks Hindi, English and Hinglish.**

Flutter · FastAPI · SQLite · GPT · Speech-to-Text · Text-to-Speech

**📱 Phone me chalana hai? → [PHONE.md](PHONE.md)** — web app + APK, dono ka
poora step-by-step process (Hinglish me).

**🚀 Live karna hai (Render)? → [RENDER.md](RENDER.md)** — step-by-step, aur
**bina computer ke** sirf phone se karne ka tareeka bhi.

**🌐 Baaki hosting options? → [DEPLOY.md](DEPLOY.md)** — Netlify, Docker,
free APK build.

</div>

---

## ⚡ 30-second start

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```
Chrome me kholo → **http://localhost:8000**

**Phone pe test karna hai?** Ek hi command — QR code scan karke phone me khul
jayegi (phone aur computer same WiFi pe hone chahiye):

```bash
python start-phone.py
```

> **Note:** Ye app sirf Netlify pe deploy karne se kaam nahi karegi — Netlify
> Python backend nahi chala sakta. Wajah aur solution [DEPLOY.md](DEPLOY.md)
> me detail me hai.

---

## What it is

Ajay listens to a spoken command in **Hindi or English**, understands the intent, and
*actually does something on the phone* — dials a contact, opens an app, sets an alarm,
searches the web, saves a note, reads out the weather — then answers in a natural voice
in the same language the user spoke.

| Layer | Technology | Where |
|---|---|---|
| Mobile app | **Flutter 3** (Material 3, custom painters, Provider) | `mobile/` |
| Backend brain | **Python 3.11+ / FastAPI** | `backend/` |
| Database | **SQLite** on both sides (Firebase optional) | `backend/data/`, device |
| AI | **GPT (OpenAI-compatible)** + an offline bilingual rule engine | `backend/app/ai/` |
| Voice | `speech_to_text` + `flutter_tts` (Web Speech API in the demo) | `mobile/lib/services/` |
| Live web demo | The same UI in HTML/CSS/JS, driven by the real API | `backend/app/static/` |

> **Try it right now without Android:** start the backend and open
> <http://localhost:8000> — a pixel-faithful web mirror of the Flutter app runs there,
> talking to the real brain (mic works in Chrome/Edge).

---

## ✨ Features

### 1. Voice assistant
- Big animated mic button; tap to talk, tap to stop.
- Speech-to-text in **`hi-IN`** and **`en-IN`** with automatic fallback if a language
  pack is missing.
- Natural-language understanding of Hindi (Devanagari), English **and Hinglish**
  (`"Rahul ko call karo"`).
- Realistic text-to-speech replies with selectable voice, rate and pitch.
- Live partial transcript while you speak; the orb reacts to your voice volume.

### 2. AI brain (hybrid, never dead)
- **Rule engine first** (`backend/app/ai/nlu.py`): ~45 weighted bilingual patterns →
  instant, free, works offline, and *phone control never waits on a network hop*.
- **GPT second** (`backend/app/ai/brain.py`): anything conversational or ambiguous goes
  to an OpenAI-compatible model with **tool calling**, so even free-form chat can return
  a structured phone action.
- **Graceful degradation:** no API key, rate limit or timeout → friendly offline answers.
- **Conversation history** kept server-side and mirrored on-device.
- **Memory system:** explicit facts (`my name is …`, `I live in Delhi`) plus implicit
  habits (most-opened apps, most-called contacts) that personalise the quick actions.

### 3. Phone control
Calls · SMS · WhatsApp · open any installed app · web & YouTube search · alarms · timers ·
camera · gallery · files · settings pages (Wi-Fi, Bluetooth, battery…) · navigation ·
torch · battery status — all through standard Android intents, no root, no accessibility abuse.

### 4. Smart assistant features
Daily planner · to-do list · calendar reminders (real local notifications) · weather
(Open-Meteo, live) · news (Google News RSS, live) · text & voice notes · translation
(19 languages + offline phrasebook) · safe calculator.

### 5. Screens
**Home** (orb, mic, greeting, personalised quick actions) · **Chat** (bubbles, rich
weather/news/calculator cards, voice + text input) · **History** (searchable, stats,
swipe-to-delete, tap-to-rerun) · **Settings** (voice, language, rate, pitch, privacy
switches, memory viewer, danger zone).

### 6. Security
Consent sheet before **every** call and message · runtime permissions requested in
context · Argon2id password hashing · JWT sessions · Keystore-backed token storage ·
no cloud backup of user data · one-tap erase of memory, history or the whole account.

---

## 🚀 Quick start

```bash
# 1 · Backend  (Python 3.11+)
cd backend
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                   # optional: add OPENAI_API_KEY
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# → API docs:  http://localhost:8000/docs
# → Web demo:  http://localhost:8000

# 2 · Mobile app  (Flutter 3.19+)
cd ../mobile
flutter pub get
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:8000     # emulator
# physical device: use your laptop's LAN IP, e.g. http://192.168.1.5:8000
```

Full instructions, signing and release build: **[INSTALL.md](INSTALL.md)**.

---

## 🗣 Try these commands

| English | हिंदी / Hinglish | What happens |
|---|---|---|
| `Call Rahul` | `राहुल को कॉल करो` | Consent sheet → dialler |
| `Send message to Amit` | `अमित को मैसेज भेजो` | Consent sheet → SMS composer |
| `Open YouTube` | `यूट्यूब खोलो` | Launches the app (web fallback) |
| `Search cricket news` | `क्रिकेट न्यूज़ बताओ` | Live headlines, read aloud |
| `Set alarm for 7 AM` | `सुबह 7 बजे अलार्म लगाओ` | Real system alarm |
| `Open camera` | `कैमरा खोलो` | Camera intent |
| `Find my photos` | `मेरी फोटो दिखाओ` | Gallery |
| `What's the weather in Delhi` | `दिल्ली का मौसम` | Live weather card |
| `Translate good morning to Hindi` | — | `सुप्रभात` |
| `Remind me to call mom at 8 pm` | `मुझे 8 बजे याद दिलाना` | Reminder + notification |

The complete matrix is in **[docs/COMMANDS.md](docs/COMMANDS.md)**.

---

## 🧱 Project structure

```
ajay_ai_assistant/
├── backend/                     # FastAPI brain
│   ├── app/
│   │   ├── main.py              # app factory, middleware, routers
│   │   ├── config.py            # env-driven settings
│   │   ├── database.py          # SQLite schema + helpers
│   │   ├── security.py          # Argon2 + JWT + dependencies
│   │   ├── schemas.py           # Pydantic contracts
│   │   ├── ai/
│   │   │   ├── nlu.py           # bilingual rule engine  ★ the heart
│   │   │   ├── brain.py         # GPT orchestration + tools + memory
│   │   │   ├── prompts.py       # system prompt & tool schema
│   │   │   └── memory.py        # long-term memory + habit learning
│   │   ├── routers/             # auth, assistant, history, tasks, …
│   │   ├── services/            # weather, news, translate, calculator
│   │   └── static/              # the live web demo of the UI
│   └── tests/                   # 72 pytest tests
├── mobile/                      # Flutter app
│   ├── lib/
│   │   ├── core/                # config, theme (tokens shared with the web demo)
│   │   ├── data/                # models, API client, SQLite, secure storage
│   │   ├── services/            # speech, TTS, permissions, phone control, notifications
│   │   ├── providers/           # assistant, settings, history state
│   │   └── presentation/        # screens + widgets (AI orb, mic, bubbles, sheets)
│   ├── android/                 # manifest, permissions, gradle, proguard
│   └── test/                    # widget + contract tests
└── docs/                        # architecture, API, commands, security
```

---

## 🧪 Tests

```bash
cd backend && pytest -q        # 104 passed — NLU, API, auth, tools, isolation
cd ../mobile && flutter test   # widget + JSON-contract tests
```

---

## 📚 Documentation

- [INSTALL.md](INSTALL.md) — setup, emulator, device, release APK/AAB
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — how a spoken sentence becomes an action
- [docs/API.md](docs/API.md) — every endpoint with examples
- [docs/COMMANDS.md](docs/COMMANDS.md) — supported commands (EN/HI/Hinglish)
- [docs/SECURITY.md](docs/SECURITY.md) — permissions, data handling, threat model

---

## 🗺 Roadmap after the MVP

1. Wake-word (`"Hey Ajay"`) with on-device Porcupine.
2. Contact resolution against the address book with fuzzy Hindi name matching.
3. Streaming replies (SSE) so long answers start speaking immediately.
4. Firebase sync for multi-device history + Google sign-in.
5. Home-screen widget and Quick Settings tile.
6. Whisper-based STT fallback for noisy environments.

---

MIT licensed. Built as a complete, production-shaped MVP — not a mock-up.
