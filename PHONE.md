# 📱 Phone Me Chalane Ka Poora Process

> Do tareeke hain. Pehle ye table dekh lo — dono me **kya kaam karta hai aur
> kya nahi**, kyunki ye farq bahut zaroori hai.

---

## ⚖️ Pehle ye samjho: Web App vs APK

| Feature | 🌐 Web App (browser) | 📦 APK (asli app) |
|---|---|---|
| Setup time | **5-15 min** | 20-30 min |
| Chat, AI replies | ✅ | ✅ |
| Weather, News, Translate, Calculator | ✅ | ✅ |
| To-do, Reminders, Notes, Planner | ✅ | ✅ |
| Voice input (mic) | ⚠️ Sirf **HTTPS** pe | ✅ Hamesha |
| Voice reply (TTS) | ✅ | ✅ |
| **"Call Rahul"** (naam se) | ❌ Browser contacts nahi padh sakta | ✅ |
| **"Call 9876543210"** (number se) | ✅ Dialer khulta hai | ✅ |
| WhatsApp / SMS bhejna | ✅ number ho to | ✅ |
| YouTube / Maps / Google kholna | ✅ | ✅ |
| **Asli app kholna** (Camera, Gallery, Settings) | ❌ | ✅ |
| **Alarm / Timer** set karna | ❌ | ✅ |
| **Flashlight** on/off | ❌ | ✅ |
| Home screen pe icon | ✅ (Add to Home Screen) | ✅ |
| Offline chalega | ❌ | ⚠️ Partially |

### 👉 Matlab kya hai?

- **Sirf baat-cheet, weather, news, to-do chahiye?** → **Web App** kaafi hai. 15 min.
- **Phone ko sach me control karna hai** (camera kholo, alarm lagao, torch on karo)?
  → **APK** chahiye. Browser ko Android ye permissions deta hi nahi.

---

# 🌐 TAREEKA 1 — Web App (aasaan)

Iske do sub-options hain. **Option B recommended hai.**

---

## Option A — Same WiFi (5 min, sirf test ke liye)

Phone aur computer ek hi WiFi pe. **Mic kaam nahi karega** (neeche wajah hai),
par typing chalegi.

### Steps

**1.** Computer pe project folder me jao aur ye chalao:

```bash
python start-phone.py
```

Ye script apne aap:
- aapka WiFi IP dhoondhega
- ek **QR code** dikhayega
- server chalu kar dega

**2.** Screen pe kuch aisa aayega:

```
  Phone pe ye URL kholo:

      http://192.168.1.7:8000

  ▄▄▄▄▄▄▄  ▄ ▄  ▄▄▄▄▄▄▄
  █ ▄▄▄ █ ▀█▄▀▄ █ ▄▄▄ █     ← QR code
  █ ███ █ ▄█▀ ▀ █ ███ █
  ...
```

**3.** Phone ke camera se **QR scan** karo, ya wo URL Chrome me type karo.

**4.** App khul jayegi. Type karke command do — *"Delhi ka mausam bataao"*.

### ⚠️ Mic kyun kaam nahi karega?

Browser mic sirf **"secure context"** me deta hai — yaani **HTTPS**, ya
`localhost`. `http://192.168.1.7` secure nahi mana jata, isliye Chrome mic
**block** kar dega. Ye Chrome ka security rule hai, app ka bug nahi.

App aapko saaf-saaf bata degi: *"Mic needs HTTPS. Typing works fine."*

**Mic chahiye? → Option B karo (HTTPS milta hai).**

<details>
<summary>Ya phir Chrome ka flag on karo (advanced, sirf testing)</summary>

Phone ke Chrome me kholo:
```
chrome://flags/#unsafely-treat-insecure-origin-as-secure
```
Usme `http://192.168.1.7:8000` daalo → **Enabled** → Chrome restart karo.
Ab mic chalega. **Ye sirf testing ke liye hai**, permanent solution nahi.
</details>

### Agar phone pe URL na khule

| Problem | Fix |
|---|---|
| Page load hi nahi hota | Computer ka **firewall** band karo (Windows Defender port 8000 block karta hai) |
| "Site can't be reached" | Dono devices sach me ek hi WiFi pe hain? Mobile data **off** karo |
| Office/College WiFi | Wahan device-to-device blocked hota hai. Mobile hotspot use karo |

---

## Option B — Render pe host karo ⭐ RECOMMENDED (15 min)

Isme **sab kuch kaam karega** — mic bhi — kyunki Render **free HTTPS** deta
hai. Aur computer band ho jaye tab bhi app chalti rahegi. Duniya me kahin se
bhi khul jayegi.

### Steps

**1. Code GitHub pe daalo**

[github.com](https://github.com) pe account banao → naya **Public** repository
banao (naam: `ajay-ai-assistant`).

Computer pe project folder ke andar:
```bash
git init
git add .
git commit -m "Ajay AI Assistant"
git branch -M main
git remote add origin https://github.com/AAPKA-USERNAME/ajay-ai-assistant.git
git push -u origin main
```

**2. Render pe deploy**

1. [render.com](https://render.com) → **Sign in with GitHub**
2. **New +** → **Blueprint**
3. Apna repo select karo → **Apply**

3-5 min me deploy ho jayega. URL milega:
```
https://ajay-ai-assistant-api.onrender.com
```

**3. Phone me kholo**

Wo URL phone ke Chrome me kholo. **Bas — mic bhi chalega, sab chalega.** 🎉

**4. Home screen pe icon lagao (app jaisa feel)**

Chrome me → **⋮ menu** → **"Add to Home screen"** / **"Install app"**

Ab home screen pe **Ajay** ka icon aa jayega. Tap karo to **full screen** me
khulega — bilkul asli app jaisa, browser ka address bar bhi nahi dikhega.

> **Ek baat pehle se:** Render free tier 15 min baad **so jaata** hai. Uske
> baad pehli baar kholne pe **30-50 second** lagenge. Ye normal hai. $7/month
> pe ye band ho jata hai.

---

# 📦 TAREEKA 2 — APK banao (asli app)

Ye Flutter wali asli Android app hai. Ye **sach me** phone control kar sakti
hai — camera kholna, alarm lagana, torch, contacts se call, sab.

## ⚠️ Pehle ye zaroor karo

**Backend live hona chahiye.** APK ko internet pe ek server chahiye jisse wo
baat kare. To pehle **Tareeka 1 → Option B** (Render) complete karo aur apna
URL note kar lo.

> ❌ APK me `localhost` mat dena. Phone ke liye "localhost" khud phone hota
> hai, aapka computer nahi. Isliye kuch kaam nahi karega.

---

## Step 1 — GitHub pe code (agar pehle nahi kiya)

Upar Option B ka Step 1 dekho.

## Step 2 — Backend URL set karo

GitHub pe apne repo me:

1. **Settings** tab
2. Left me **Secrets and variables** → **Actions**
3. Upar **Variables** tab (Secrets nahi — **Variables**)
4. **New repository variable**
   - **Name:** `API_BASE_URL`
   - **Value:** `https://ajay-ai-assistant-api.onrender.com` ← *apna asli URL*
5. **Add variable**

## Step 3 — APK build karo (cloud me, free)

1. Repo me **Actions** tab kholo
2. Left side me **"Build Android APK"** pe click
3. Right side **"Run workflow"** button → dobara **Run workflow**
4. **5-10 minute** ruko ☕ (Flutter download + build hota hai)
5. Green ✅ aane par us run pe click karo
6. Page ke **sabse neeche** → **Artifacts** section
7. **`ajay-ai-assistant-apk`** download karo (ZIP milega)

> Aapko Flutter, Java, ya Android Studio install karne ki **zaroorat nahi** —
> sab GitHub ke server pe hota hai, bilkul free.

## Step 4 — Phone me install karo

1. Downloaded ZIP kholo → andar `app-release.apk` milegi
2. APK phone me bhejo — **WhatsApp (khud ko), Google Drive, email, ya USB cable**
3. Phone me us file pe tap karo
4. Android bolega: **"Unknown sources se install allowed nahi"**
   → **Settings** → **Allow from this source** → wapas aao
5. **Install** → **Open**

## Step 5 — Permissions do

App pehli baar khulne pe permissions maangegi. Ye **zaroori** hain:

| Permission | Kis liye | Zaroori? |
|---|---|---|
| 🎤 **Microphone** | Aapki awaaz sunne ke liye | ✅ **Haan** |
| 📞 **Phone** | Call karne ke liye | Call chahiye to |
| 👥 **Contacts** | "Call Rahul" me Rahul ka number dhoondhne | Call chahiye to |
| 💬 **SMS** | Message bhejne | Message chahiye to |
| 📷 **Camera** | "Camera kholo" | Optional |
| 🖼 **Photos/Media** | "Meri photos dikhao" | Optional |
| 🔔 **Notifications** | Reminder alert | Reminder chahiye to |
| ⏰ **Alarms** | "7 baje alarm lagao" | Alarm chahiye to |

> **Privacy note:** App **kabhi bhi** bina poochhe call ya message nahi
> karegi. Har baar ek confirmation screen aayegi — "Allow" dabane par hi kaam
> hoga. Ye security by design hai (`docs/SECURITY.md` dekho).

---

# 🎯 Kaunsa Tareeka Chunein?

```
                    Phone pe chalana hai
                            │
              ┌─────────────┴─────────────┐
              │                           │
      Sirf chat/weather/            Phone control chahiye?
      news/to-do chahiye?           (camera, alarm, torch,
              │                      contacts se call)
              │                           │
              ▼                           ▼
    ┌──────────────────┐        ┌──────────────────┐
    │  WEB APP         │        │  APK             │
    │  Option B        │        │  Tareeka 2       │
    │  (Render)        │        │  (pehle Render,  │
    │  15 min          │        │   phir APK)      │
    │  Mic ✅          │        │  30 min          │
    └──────────────────┘        └──────────────────┘
```

**Meri salah — is order me karo:**

1. **Aaj:** `python start-phone.py` chalao, phone pe QR scan karo → 5 min me
   dekh lo app kaisi hai (typing se)
2. **Phir:** Render pe deploy karo → mic ke saath poori app, phone pe permanent
3. **Baad me:** APK banao jab phone control chahiye ho

---

# 🔧 Problems aur Solutions

| Problem | Wajah | Fix |
|---|---|---|
| Phone pe URL nahi khulta | Firewall / alag WiFi | Firewall band karo; dono same WiFi pe rakho; mobile data off |
| Mic button dabane pe "Mic needs HTTPS" | `http://192.168.x.x` secure context nahi hai | Render pe deploy karo (HTTPS free) — Option B |
| Mic pe kuch nahi hota (Render pe bhi) | Permission deny ho gayi | Chrome → 🔒 icon → Permissions → Microphone → **Allow** |
| Awaaz samajh nahi aa rahi | Language mismatch | Settings me Hindi/English/Auto set karo |
| Pehli baar 40 sec lagta hai | Render free tier so gaya tha | Normal hai. Paid plan se hatega |
| APK install nahi ho rahi | Unknown sources blocked | Settings → Apps → Chrome/Files → "Install unknown apps" allow |
| "App not installed" | Purana version hai | Purana uninstall karke dobara try karo |
| APK khulti hai par reply nahi | `API_BASE_URL` galat ya backend so raha hai | Pehle browser me backend URL kholo, chal raha hai? Phir dobara build |
| "Call Rahul" browser me kaam nahi karta | Browser contacts nahi padh sakta | Number bolo (*"call 9876543210"*), ya APK use karo |
| Build workflow fail ho gaya | Flutter/dependency issue | Actions log kholo, red ❌ step padho — error wahin likha hoga |

---

# ✅ Quick Reference

```bash
# Sabse fast test (computer + phone same WiFi)
python start-phone.py
# → QR scan karo phone se

# Sirf computer pe
cd backend && uvicorn app.main:app --host 0.0.0.0 --port 8000
# → http://localhost:8000

# Docker se
docker compose up
```

**Live karne ke liye:** [DEPLOY.md](DEPLOY.md) padho
**Commands ki list:** [docs/COMMANDS.md](docs/COMMANDS.md)
**Security details:** [docs/SECURITY.md](docs/SECURITY.md)

---

## 💰 Kharcha

| Cheez | Free? |
|---|---|
| Web app (Render) | ✅ Free |
| APK build (GitHub Actions) | ✅ Free |
| Weather / News / Translate | ✅ Free |
| GPT (optional) | ❌ Paid — bina iske bhi app poori chalti hai |

**Poori app phone pe ₹0 me chal sakti hai.** 🎉
