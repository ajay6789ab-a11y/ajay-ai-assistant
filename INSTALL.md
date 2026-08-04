# Installation & Setup — Ajay AI Assistant

Everything you need to go from a fresh clone to a signed APK on a phone.

---

## 0. Prerequisites

| Tool | Version | Check |
|---|---|---|
| Python | 3.11 – 3.13 | `python --version` |
| Flutter | 3.19+ (Dart 3.3+) | `flutter --version` |
| Android SDK | API 34, build-tools 34 | `flutter doctor -v` |
| Java JDK | 17 | `java -version` |
| A device | Android 6.0 (API 23) or newer, **or** an emulator | `flutter devices` |

Run `flutter doctor` and clear every ✗ before continuing.

---

## 1. Backend (the AI brain)

```bash
cd backend

python -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\activate

pip install -r requirements.txt
cp .env.example .env
```

### Configure `.env`

| Key | Required? | Notes |
|---|---|---|
| `JWT_SECRET` | **yes for production** | `openssl rand -hex 32` |
| `OPENAI_API_KEY` | optional | Empty ⇒ the offline rule engine handles everything |
| `AI_BASE_URL` | optional | Any OpenAI-compatible endpoint (Azure, Groq, OpenRouter, Ollama) |
| `AI_MODEL` | optional | Default `gpt-4o-mini` |
| `DB_PATH` | optional | Default `./data/ajay.db` |
| `CORS_ORIGINS` | optional | Comma-separated; lock this down in production |

Weather (Open-Meteo), news (Google News RSS) and translation (MyMemory) need **no keys**.

### Run it

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

- Swagger UI → <http://localhost:8000/docs>
- Health → <http://localhost:8000/api/health>
- **Web demo of the app UI** → <http://localhost:8000>

### Verify

```bash
pytest -q                                        # 104 tests should pass

TOKEN=$(curl -s -X POST localhost:8000/api/auth/guest \
  -H 'Content-Type: application/json' \
  -d '{"device_id":"dev-1"}' | python -c "import sys,json;print(json.load(sys.stdin)['access_token'])")

curl -s -X POST localhost:8000/api/assistant/chat \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"text":"Set alarm for 7 AM"}' | python -m json.tool
```

---

## 2. Mobile app

```bash
cd mobile
flutter pub get
```

### Point the app at your backend

| Where the app runs | `API_BASE_URL` |
|---|---|
| Android emulator | `http://10.0.2.2:8000` |
| Physical device on the same Wi-Fi | `http://<your-laptop-LAN-IP>:8000` |
| Deployed server | `https://api.yourdomain.com` |

```bash
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:8000
```

> Cleartext HTTP is allowed **only** for `10.0.2.2`, `localhost` and `192.168.*`
> (see `android/app/src/main/res/xml/network_security_config.xml`). Production
> traffic must be HTTPS.

### First launch

1. The splash screen signs the device in anonymously (no signup wall).
2. Tap the mic → Android asks for **Microphone**. Allow it.
3. Say *"Open YouTube"* or type it in the Chat tab.
4. Say *"Call Rahul"* → the consent sheet appears → **Allow** requests
   **Phone**/**Contacts** only at that moment.

### Hindi speech on the device

Settings → System → Languages & input → **Voice input / Text-to-speech**
→ install the **हिन्दी (भारत)** recognition and TTS packs. Without them the app
automatically falls back to English recognition (Hinglish still works).

---

## 3. Release build

```bash
# Create a keystore once
keytool -genkey -v -keystore ~/ajay-release.jks \
        -keyalg RSA -keysize 2048 -validity 10000 -alias ajay

# mobile/android/key.properties   (never commit this file)
cat > android/key.properties <<EOF
storePassword=********
keyPassword=********
keyAlias=ajay
storeFile=/absolute/path/to/ajay-release.jks
EOF

flutter build apk --release --dart-define=API_BASE_URL=https://api.yourdomain.com
flutter build appbundle --release --dart-define=API_BASE_URL=https://api.yourdomain.com
```

Artifacts:
- `build/app/outputs/flutter-apk/app-release.apk`
- `build/app/outputs/bundle/release/app-release.aab` (Play Store)

Smaller per-ABI APKs: `flutter build apk --split-per-abi`.

---

## 4. Deploying the backend

### Docker

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ .
ENV DEBUG=false
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
```

```bash
docker build -t ajay-backend .
docker run -p 8000:8000 --env-file backend/.env -v $(pwd)/data:/app/data ajay-backend
```

### Production checklist

- [ ] `DEBUG=false` (enables `X-Frame-Options`, quiets logs)
- [ ] Strong `JWT_SECRET`, rotated periodically
- [ ] `CORS_ORIGINS` restricted to your own domains
- [ ] HTTPS terminated by nginx/Caddy/Cloud Run
- [ ] Nightly backup of `data/ajay.db` (or migrate to Postgres — one file to change)
- [ ] Rate limiting at the reverse proxy (e.g. 60 req/min per IP)
- [ ] Monitor `/api/health`

---

## 5. Optional: Firebase instead of SQLite

1. `flutterfire configure` in `mobile/`.
2. Uncomment the `firebase_*` dependencies in `pubspec.yaml`.
3. Set `FIREBASE_CREDENTIALS=/path/service-account.json` in the backend `.env`.
4. Swap the repository implementation — every query is isolated in
   `backend/app/database.py`, so nothing else changes.

---

## 6. Troubleshooting

| Symptom | Fix |
|---|---|
| `No connection to the assistant service` | Wrong `API_BASE_URL`; emulator must use `10.0.2.2`, not `localhost` |
| Mic button does nothing | Microphone permission denied → app info → Permissions → Microphone |
| Hindi recognised as gibberish | Install the Hindi voice-input pack (§2) |
| TTS silent | Install Google Text-to-Speech + a voice; check media volume |
| `MissingPluginException` | `flutter clean && flutter pub get`, then full restart (not hot reload) |
| Alarm doesn't fire | Android 14: allow "Alarms & reminders" for the app |
| `pytest` import errors | Run it from inside `backend/`, with the venv active |
| Web demo mic blocked | Open the page in its own tab over HTTPS/localhost (iframes need explicit mic permission) |
