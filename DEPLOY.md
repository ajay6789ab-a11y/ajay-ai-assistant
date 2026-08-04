# 🚀 Ajay AI Assistant — Deployment Guide (Hinglish)

> **Sabse pehle sabse zaroori baat:**
> **Sirf Netlify pe daalne se ye app kaam NAHI karegi.**
> Neeche poori wajah aur solution diya hai.

---

## ❓ Netlify kyun akela kaafi nahi hai?

Is project me **3 alag cheezein** hain, aur teeno ki hosting alag hai:

| # | Hissa | Ye kya hai | Netlify chala sakta hai? |
|---|-------|-----------|--------------------------|
| 1 | `backend/` | Python FastAPI server (AI brain, database, login) | ❌ **Nahi** |
| 2 | `backend/app/static/` | Web UI (HTML/CSS/JS) | ✅ **Haan** |
| 3 | `mobile/` | Flutter Android app (APK) | ❌ **Nahi** |

**Reason:** Netlify ek **static hosting** service hai. Wo sirf HTML, CSS, JS
files browser ko bhej sakta hai. Wo ek **Python process 24x7 chala nahi
sakta**. Aur APK banane ke liye Android SDK chahiye, jo Netlify pe nahi hota.

Agar aap sirf Netlify pe daaloge to:
- Page to khul jayega (design dikhega) ✅
- Par mic dabate hi **"Failed to fetch" / error** aayega ❌
- Kyunki `/api/assistant/chat` ko koi jawab dene wala hi nahi hoga

**Simple analogy:** Netlify = dukaan ka **showroom**. Backend = **godown +
staff**. Sirf showroom khol doge to customer aayega, saman maangega, aur
khaali haath lautega.

---

## ✅ Sahi Setup — 2 hisse

```
┌─────────────────────┐         ┌──────────────────────┐
│   NETLIFY           │  /api/* │   RENDER             │
│   (Web UI)          │────────►│   (Python backend)   │
│   free              │  proxy  │   free               │
└─────────────────────┘         └──────────────────────┘
                                          │
                                    ┌─────▼──────┐
                                    │  SQLite DB │
                                    └────────────┘
```

Ya phir **sabse aasaan raasta**: sirf **Render** use karo — wo backend AUR web
UI dono ek saath serve kar deta hai (kyunki FastAPI khud hi static files serve
karta hai). Tab Netlify ki zaroorat hi nahi.

---

# 🎯 Aapke paas 4 raaste hain

Apni zaroorat ke hisaab se chuno:

| Raasta | Kitna time | Kya milega | Kiske liye |
|--------|-----------|------------|------------|
| **A** | 5 min | Apne PC pe chalega | Test karne ke liye |
| **B** | 15 min | Internet pe live website | ⭐ **Recommended** |
| **C** | 20 min | Netlify + Render dono | Agar Netlify hi chahiye |
| **D** | 10 min | Android APK phone me | Asli mobile app |

---

## 🅰️ Raasta A — Apne computer pe chalao (5 min)

Sabse pehle ye karke dekh lo ki sab sahi chal raha hai.

### Zaroorat
- Python 3.10+ ([python.org](https://python.org) se download, install karte
  waqt **"Add Python to PATH"** wala box zaroor tick karna)

### Steps

```bash
# 1. Zip extract karo, phir terminal/CMD me us folder me jao
cd ajay_ai_assistant/backend

# 2. Dependencies install karo (ek hi baar karna hai)
pip install -r requirements.txt

# 3. Server chalu karo
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Ab Chrome me kholo: **http://localhost:8000**

Bas! App chal rahi hai. Mic dabao aur bolo *"Delhi ka mausam bataao"*.

> **Note:** Voice input sirf **Chrome / Edge** me kaam karta hai. Firefox me
> Web Speech API support nahi hai — wahan sirf typing chalegi.

### Docker wala shortcut
Agar Python install nahi karna, sirf Docker Desktop hai:
```bash
docker compose up
```
Phir wahi **http://localhost:8000** kholo.

---

## 🅱️ Raasta B — Render pe live karo ⭐ RECOMMENDED (15 min)

Ye sabse simple hai — **ek hi jagah** backend + website dono. Netlify ki
zaroorat nahi. Bilkul **free**.

### Step 1 — Code GitHub pe daalo

[github.com](https://github.com) pe account banao, phir naya repository banao
(naam: `ajay-ai-assistant`, **Public** rakho — free tier ke liye).

Apne PC pe folder ke andar:
```bash
git init
git add .
git commit -m "Ajay AI Assistant"
git branch -M main
git remote add origin https://github.com/AAPKA-USERNAME/ajay-ai-assistant.git
git push -u origin main
```

### Step 2 — Render pe deploy karo

1. [render.com](https://render.com) pe jao → **"Sign in with GitHub"**
2. Dashboard me **New +** → **Blueprint**
3. Apna `ajay-ai-assistant` repo select karo
4. Render khud `render.yaml` padh lega aur sab set kar dega
5. **Apply** dabao

Bas. 3-5 minute me deploy ho jayega.

Aapko ek URL milega jaise:
```
https://ajay-ai-assistant-api.onrender.com
```

**Wahi URL phone/laptop kisi bhi browser me kholo — poori app chalegi.** 🎉

### Step 3 (optional) — GPT chaalu karo

Bina API key ke app **offline rule engine** pe chalti hai — 46 command patterns
samajhti hai, weather/news/translate sab kaam karta hai. Par free-form baatein
("mujhe motivate karo") nahi samajhti.

GPT on karne ke liye:
1. [platform.openai.com](https://platform.openai.com) → API key banao
2. Render dashboard → apni service → **Environment**
3. `AI_API_KEY` me apni key paste karo → **Save**

> ⚠️ OpenAI ki key **paid** hai (~₹400 se shuru). Bina key ke bhi app poori
> tarah chalti hai, bas AI thoda kam "smart" hota hai.

### ⚠️ Free tier ki 2 limitations

1. **Sleep mode** — 15 min tak koi na aaye to service so jaati hai. Uske baad
   pehli request me **30-50 second** lagte hain. Ye normal hai, bug nahi.
   Hatane ke liye $7/month ka plan lena padega.
2. **Data mit sakta hai** — free disk temporary hota hai, redeploy pe chat
   history saaf ho sakti hai. Permanent chahiye to Render Disk (paid) ya
   PostgreSQL use karo.

---

## 🅲 Raasta C — Netlify + Render (agar Netlify hi chahiye)

Website Netlify pe, backend Render pe.

### Step 1 — Pehle backend deploy karo
**Raasta B** ke Step 1-2 follow karo. URL note kar lo, jaise
`https://ajay-ai-assistant-api.onrender.com`

### Step 2 — netlify.toml me backend URL daalo

`netlify.toml` file kholo aur ye line dhoondo:
```toml
to = "https://BACKEND_URL/api/:splat"     # <-- CHANGE THIS
```

`BACKEND_URL` ki jagah apna asli Render URL likho:
```toml
to = "https://ajay-ai-assistant-api.onrender.com/api/:splat"
```

Save karke GitHub pe push karo:
```bash
git add netlify.toml
git commit -m "Point Netlify to backend"
git push
```

### Step 3 — Netlify pe deploy

1. [netlify.com](https://netlify.com) → **Sign in with GitHub**
2. **Add new site** → **Import an existing project** → apna repo chuno
3. Settings apne aap `netlify.toml` se aa jayengi — bas **Deploy** dabao

Aapko URL milega jaise `https://ajay-assistant.netlify.app` — ab **poori tarah
kaam karega**, kyunki `/api/*` requests Netlify chupke se Render ko forward kar
deta hai (isi wajah se CORS error bhi nahi aayega).

### Step 4 — CORS allow karo
Render dashboard → **Environment** → `CORS_ORIGINS` me apna Netlify URL daalo:
```
https://ajay-assistant.netlify.app
```

---

## 🅳 Raasta D — Android APK banao (phone me install)

Ye asli mobile app hai (Flutter). Iske **2 tareeke** hain.

### Tareeka 1 — GitHub pe free build ⭐ (Flutter install nahi karna padega)

Maine iske liye ready-made workflow bana diya hai.

1. Code GitHub pe push karo (Raasta B ka Step 1)
2. Repo → **Settings** → **Secrets and variables** → **Actions** →
   **Variables** tab → **New repository variable**:
   - Name: `API_BASE_URL`
   - Value: `https://ajay-ai-assistant-api.onrender.com` *(apna Render URL)*
3. Repo → **Actions** tab → left me **"Build Android APK"** → **Run workflow**
4. 5-10 min ruko (green ✅ aane tak)
5. Us run pe click karo → neeche **Artifacts** → `ajay-ai-assistant-apk`
   download karo
6. ZIP kholo, APK phone me copy karo, install karo
   *(Android "unknown sources" allow karne ko bolega — allow kar dena)*

### Tareeka 2 — Apne PC pe build karo

Agar Flutter installed hai:
```bash
cd mobile
flutter pub get
flutter build apk --release --dart-define=API_BASE_URL=https://aapka-backend.onrender.com
```
APK yahan milegi: `mobile/build/app/outputs/flutter-apk/app-release.apk`

> **Zaroori:** `API_BASE_URL` me apna **live Render URL** dena. Agar
> `localhost` ya `10.0.2.2` doge to app sirf emulator me chalegi, asli phone me
> nahi — kyunki phone ke liye "localhost" khud phone hota hai, aapka PC nahi.

---

## 📊 Kaunsa raasta chunein?

```
Sirf test karna hai?              -> Raasta A (local)
Dosto ko link bhejna hai?         -> Raasta B (Render)  ⭐
Netlify pe hi daalna hai?         -> Raasta C
Phone me app chahiye?             -> Raasta D
```

**Meri salah:** Pehle **A** karke check karo sab chal raha hai. Phir **B**
karke live karo. APK (**D**) baad me, jab backend live ho jaye.

---

## 🔧 Common problems aur fix

| Problem | Kyun hota hai | Fix |
|---------|--------------|-----|
| Netlify pe page khulta hai par "Failed to fetch" | Backend deploy nahi hua, ya `netlify.toml` me `BACKEND_URL` badla nahi | Raasta C ka Step 2 dobara karo |
| Pehli request me 40 sec lagte hain | Render free tier sleep se jaag raha hai | Normal hai. Paid plan se hatega |
| Mic button kaam nahi karta | Site HTTP pe hai, ya Firefox use kar rahe ho | HTTPS zaroori hai (Netlify/Render dono dete hain). Chrome/Edge use karo |
| APK install pe "app not installed" | Purana version pehle se hai | Purana uninstall karke dobara try karo |
| APK khulti hai par reply nahi aata | `API_BASE_URL` galat hai | Live backend URL ke saath dobara build karo |
| `pip: command not found` | Python PATH me nahi hai | Python reinstall karo, "Add to PATH" tick karke |
| CORS error console me | Backend ne Netlify domain allow nahi kiya | Render pe `CORS_ORIGINS` me Netlify URL daalo |

---

## 🔐 Production me jaane se pehle

- [ ] `JWT_SECRET` ko lamba random string banao (Render `generateValue` se
      apne aap ho jata hai)
- [ ] `DEBUG=false` rakho
- [ ] `CORS_ORIGINS` me `*` ki jagah sirf apna domain daalo
- [ ] Agar chat history permanent chahiye to paid disk ya Postgres lo
- [ ] Play Store pe daalna ho to APK ko sign karna padega — `INSTALL.md` dekho

---

## 📁 Deployment files jo maine banayi

| File | Kaam |
|------|------|
| `render.yaml` | Render pe one-click deploy |
| `backend/Dockerfile` | Kisi bhi Docker host ke liye |
| `docker-compose.yml` | Local pe `docker compose up` |
| `netlify.toml` | Netlify + API proxy setup |
| `.github/workflows/build-apk.yml` | Cloud me free APK build |

---

## 💰 Kharcha

| Cheez | Free? |
|-------|-------|
| Render backend | ✅ Free (sleep ke saath) |
| Netlify hosting | ✅ Free (100GB/month) |
| GitHub + Actions | ✅ Free (public repo) |
| Weather / News / Translate | ✅ Free, koi key nahi chahiye |
| OpenAI GPT | ❌ Paid (optional — bina iske bhi app chalti hai) |

**Matlab: poori app ₹0 me live ho sakti hai.** 🎉
