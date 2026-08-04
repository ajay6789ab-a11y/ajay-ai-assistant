# 🚀 Render pe Live Karna — Poora Process

---

# ❓ Pehla sawaal: Computer chahiye ya nahi?

**Seedha jawab: Computer se bahut aasaan hai, par bina computer ke bhi ho
sakta hai.**

| Aapke paas | Time | Kaise |
|---|---|---|
| 💻 **Computer hai** | ~15 min | **Raasta 1** — seedha aur aasaan |
| 📱 **Sirf phone hai** | ~25 min | **Raasta 2** — Google Colab ke through |

### Computer kyun aasaan hai?

Project me **103 files** aur **46 folders** hain. Inhe GitHub pe pahunchana
hota hai. Phone ke browser se 103 files ek-ek karke upload karna
**practically impossible** hai — isliye ek chhota sa "jugaad" chahiye.

### To bina computer kaise?

**Google Colab** ka istemal karenge — ye ek **free online computer** hai jo
aapke phone ke browser me chalta hai. Uspe ZIP upload karenge, aur wo GitHub
pe push kar dega. Maine iske liye ready-made notebook bana diya hai:
**`deploy-from-phone.ipynb`** — bas play buttons dabane hain.

> **Ek baar deploy ho gaya, to phir kabhi computer ki zaroorat nahi.** App
> internet pe permanent chalti rahegi.

---

# 💻 RAASTA 1 — Computer Se (15 min)

## Step 0 — Git install karo (agar nahi hai)

Check karo:
```bash
git --version
```

Kuch na aaye to [git-scm.com/downloads](https://git-scm.com/downloads) se
install karo (Next-Next-Finish, default settings theek hain).

## Step 1 — GitHub account banao

[github.com/signup](https://github.com/signup) — email, password, username.
Email verify karna hoga.

## Step 2 — Code GitHub pe bhejo

ZIP extract karo, phir terminal (Windows: **CMD** ya **PowerShell**) us folder
me kholo:

```bash
cd ajay_ai_assistant

git init
git add .
git commit -m "Ajay AI Assistant"
git branch -M main
```

Ab GitHub pe naya repo banao: [github.com/new](https://github.com/new)
- **Repository name:** `ajay-ai-assistant`
- **Public** select karo
- ⚠️ "Add a README file" **tick mat karo**
- **Create repository**

Phir (apna username daal kar):
```bash
git remote add origin https://github.com/AAPKA-USERNAME/ajay-ai-assistant.git
git push -u origin main
```

Username-password maangega → **password ki jagah token** chahiye:
[github.com/settings/tokens](https://github.com/settings/tokens) →
**Generate new token (classic)** → `repo` box tick → Generate → copy karke
paste karo.

✅ Ab [github.com/AAPKA-USERNAME/ajay-ai-assistant](https://github.com) pe
saari files dikhni chahiye.

**Ab neeche "Render Steps" wale section pe jao.** ⬇️

---

# 📱 RAASTA 2 — Sirf Phone Se (25 min)

Computer bilkul nahi chahiye. Sab kuch phone ke browser me.

## Step 1 — Do cheezein taiyaar karo

**(a) ZIP download karo**
Is chat se `ajay-ai-assistant.zip` phone me download kar lo. Downloads folder
me reh jaane do.

**(b) GitHub account banao**
[github.com/signup](https://github.com/signup) — phone ke browser me hi ho
jayega. Email verify karo.

## Step 2 — GitHub token banao

Ye "password" ki tarah kaam karta hai jisse Colab aapke GitHub pe code daal
sake.

1. Phone ke Chrome me kholo: [github.com/settings/tokens](https://github.com/settings/tokens)
2. **Generate new token** → **Generate new token (classic)**
3. **Note:** kuch bhi likho, jaise `colab`
4. **Expiration:** 7 days theek hai
5. Neeche scroll karke **`repo`** wala checkbox **tick karo** ✅
   *(ye sabse zaroori step hai — bina iske push fail hoga)*
6. Sabse neeche **Generate token**
7. `ghp_` se shuru hone wala code aayega → **copy karo**
   ⚠️ Ye code **sirf ek baar** dikhta hai. Kahin note kar lo (Notes app me).

## Step 3 — Colab kholo aur notebook daalo

1. Phone ke Chrome me kholo: [colab.research.google.com](https://colab.research.google.com)
2. Google account se sign in karo (Gmail wala)
3. Ek popup aayega → **Upload** tab
4. **Browse** → apni `deploy-from-phone.ipynb` file chuno
   *(ye ZIP ke andar hai — pehle ZIP extract karna hoga phone me. Android me
   Files app se ho jata hai, ya "ZArchiver" app se)*

<details>
<summary>ZIP extract nahi kar pa rahe? Ye karo</summary>

Notebook ke bina bhi ho sakta hai — Colab me **New notebook** banao aur
`RENDER.md` ke "Manual Colab code" section (sabse neeche) wala code paste
karke chala do.
</details>

> 🔴 **Cell chalane par RED aa gaya?** Ghabrao mat — pehle ye dekho:
> **[RED-ERROR-FIX.md](RED-ERROR-FIX.md)**
>
> Aur yaad rakho: Colab me **gulabi background wala text error nahi hota**
> (wo sirf pip/pytest ke messages hote hain). Asli error me `Traceback` aur
> lambi `------` line hoti hai.

## Step 4 — Notebook chalao

Notebook me har cell ke left me **▶ (play)** ka button hai. **Upar se neeche,
ek-ek karke** dabao. Har cell ka green tick aane par hi agla dabana.

| Cell | Kya karega | Aapko kya karna |
|---|---|---|
| Step 1 | ZIP upload | **Choose Files** → apni ZIP chuno |
| Step 2 | Extract | kuch nahi, wait karo |
| Step 3 | Test | kuch nahi (1-2 min lagega) |
| Step 4 | Details | username, repo name, token type karo |
| Step 5 | Push | kuch nahi — repo khud ban jayega |

Aakhir me ye dikhega:
```
🎉 Code upload ho gaya!
   https://github.com/aapka-username/ajay-ai-assistant
```

**Ab neeche "Render Steps" pe jao.** ⬇️

> 💡 Colab pehli baar "Sign in required" ya "Warning: notebook not authored by
> Google" dikha sakta hai → **Run anyway** dabao. Ye normal hai.

---

# 🎯 RENDER STEPS (dono raaston ke liye same)

Ye poora phone pe ho jayega.

## Step A — Render pe account banao

1. [render.com](https://render.com) kholo
2. **Get Started for Free** dabao
3. **GitHub** wala button chuno *(Google se mat karna — GitHub se hi karo,
   warna repo connect nahi hoga)*
4. GitHub permission maangega → **Authorize Render**

## Step B — Blueprint se deploy karo

1. Dashboard pe **New +** (upar right) dabao
2. **Blueprint** chuno
3. Apna repo **`ajay-ai-assistant`** list me dikhega → **Connect**
   - Na dikhe to **"Configure account"** → repo access do
4. Render khud `render.yaml` padh lega aur service dikha dega
5. **Blueprint Name** me kuch bhi likho, jaise `ajay`
6. **Apply** / **Create** dabao

## Step C — Wait karo (3-5 min)

Logs chalte dikhenge:
```
==> Installing dependencies
==> Build successful 🎉
==> Starting service with 'uvicorn app.main:app --host 0.0.0.0 --port $PORT'
==> Your service is live 🎉
```

Upar green **"Live"** likha aa jayega, aur URL dikhega:
```
https://ajay-ai-assistant-api.onrender.com
```

## Step D — Phone me kholo 🎉

Wo URL phone ke **Chrome** me kholo.

**App chal padegi — mic ke saath, kyunki Render free HTTPS deta hai.**

Bolo: *"Delhi ka mausam bataao"* 🎤

## Step E — Home screen pe icon lagao

Chrome me app khol kar → **⋮ menu** → **"Add to Home screen"** / **"Install app"**

Ab home screen pe **Ajay** ka icon aa jayega. Tap karne pe full-screen me
khulega — address bar bhi nahi dikhega, bilkul asli app jaisa.

---

# ⚠️ Render Free Tier — 4 sacchai

Ye pehle se jaan lo taaki baad me surprise na ho:

| Cheez | Detail |
|---|---|
| **Sleep** | 15 min tak koi na aaye to so jata hai. Agli baar **30-60 sec** lagega. Normal hai. |
| **RAM** | 512 MB, 0.1 CPU. Is app ke liye kaafi hai. |
| **Hours** | 750 hours/month free — ek service ke liye poora mahina cover ho jata hai. |
| **Data** | Free disk **temporary** hai. Redeploy pe chat history mit sakti hai. Permanent chahiye to paid disk ya Postgres. |

### Credit card maangega kya?

**Zyadatar cases me nahi.** Render ka free tier bina card ke sign-up allow
karta hai [[2]](https://expresstech.io/heroku-vs-render-an-honest-comparison-for-2026/)[[4]](https://www.srvrlss.io/provider/render/).
Lekin kabhi-kabhi abuse-prevention ke liye card verification maang leta hai
[[1]](https://flywp.com/blog/9769/best-free-docker-hosting-platforms/) —
paisa nahi katega, sirf verify karta hai.

**Agar card nahi dena chahte**, to ye free alternatives hain (dono me HTTPS
free milta hai):

<details>
<summary>Alternative 1 — Hugging Face Spaces (card bilkul nahi)</summary>

1. [huggingface.co/join](https://huggingface.co/join) — account banao
2. **New Space** → SDK me **Docker** chuno → **Blank**
3. Space ke **Files** tab me apni files upload karo (web se ho jata hai)
4. `backend/Dockerfile` ko root me `Dockerfile` naam se rakhna hoga
5. Space apne aap build karke live kar dega

Free, sota nahi (48h idle ke baad pause hota hai), HTTPS milta hai.
</details>

<details>
<summary>Alternative 2 — Koyeb / Fly.io</summary>

Dono `backend/Dockerfile` se deploy kar sakte hain. Koyeb ka free tier card
ke bina milta hai; Fly.io card maangta hai.
</details>

---

# 🔄 Baad me code badalna ho to?

Bahut aasaan — Render **apne aap** naya version deploy kar deta hai.

**Computer se:**
```bash
git add .
git commit -m "kuch badla"
git push
```

**Phone se:** Colab notebook dobara kholo aur **Step 5 wala cell** chala do.

Bas. 2-3 min me Render khud update kar dega.

---

# 🔧 Problems aur Fix

| Problem | Wajah | Fix |
|---|---|---|
| Render pe repo list me nahi dikh raha | Render ko access nahi mila | Blueprint page pe **"Configure account"** → repo select karo |
| Build fail: `ModuleNotFoundError` | `rootDir` galat | `render.yaml` me `rootDir: backend` hona chahiye — usko mat badalna |
| Deploy hua par URL khulta nahi | Abhi build chal raha hai | Logs me **"Your service is live"** aane tak ruko |
| Pehli baar 50 sec lagta hai | Free tier sleep se jaag raha hai | Normal. Paid plan ($7/mo) se hatega |
| Mic kaam nahi kar raha | Permission deny | Chrome → 🔒 icon → Permissions → Microphone → **Allow** |
| `git push` pe "Authentication failed" | Password diya, token nahi | Token banao (Raasta 2 Step 2 dekho) aur password ki jagah wo daalo |
| Colab: "repo already exists" | Repo pehle se hai | Koi baat nahi — usi me push ho jayega |
| Colab: "Bad credentials" | Token galat ya `repo` scope nahi tick kiya | Naya token banao, **`repo`** checkbox zaroor tick karo |
| Colab cell atak gaya | Session timeout | **Runtime** → **Restart** → cells dobara chalao |

---

# 📋 Manual Colab code (agar notebook upload na kar pao)

Colab me **New notebook** banao, aur ye 2 cells paste karke chalao:

**Cell 1:**
```python
from google.colab import files
import zipfile, os, shutil

uploaded = files.upload()                      # ZIP select karo
zip_name = next(n for n in uploaded if n.endswith('.zip'))

shutil.rmtree('/content/work', ignore_errors=True)
with zipfile.ZipFile(zip_name) as z:
    z.extractall('/content/work')

PROJECT = next(r for r, d, f in os.walk('/content/work')
               if 'backend' in d and 'README.md' in f)
print('✅', PROJECT, '—', sum(len(f) for _, _, f in os.walk(PROJECT)), 'files')
```

**Cell 2:**
```python
from getpass import getpass
import requests, subprocess

GH_USER  = input('GitHub username: ').strip()
GH_REPO  = input('Repo name [ajay-ai-assistant]: ').strip() or 'ajay-ai-assistant'
GH_TOKEN = getpass('GitHub token: ').strip()

H = {'Authorization': f'token {GH_TOKEN}'}
assert requests.get('https://api.github.com/user', headers=H).status_code == 200, \
    '❌ Token galat hai'

requests.post('https://api.github.com/user/repos', headers=H,
              json={'name': GH_REPO, 'private': False})

url = f'https://{GH_TOKEN}@github.com/{GH_USER}/{GH_REPO}.git'
for c in ['git init -q', 'git config user.email c@e.com', 'git config user.name C',
          'git add -A', 'git commit -q -m Ajay || true', 'git branch -M main',
          f'git remote remove origin 2>/dev/null; git remote add origin {url}',
          'git push -u origin main --force']:
    subprocess.run(c, shell=True, cwd=PROJECT)

print(f'🎉 https://github.com/{GH_USER}/{GH_REPO}')
```

---

# ✅ Checklist

```
[ ] GitHub account bana
[ ] Token bana (repo scope tick kiya)
[ ] Code GitHub pe pahuncha (103 files dikh rahi hain)
[ ] Render pe GitHub se sign in kiya
[ ] Blueprint se deploy kiya
[ ] "Your service is live 🎉" dikha
[ ] Phone me URL khola — chal raha hai
[ ] Mic permission di
[ ] Home screen pe icon lagaya
```

---

## 🔒 Aakhir me

Kaam khatam hone par apna GitHub token **delete** kar dena:
[github.com/settings/tokens](https://github.com/settings/tokens) → **Delete**

Token sirf Colab ki memory me tha, kahin save nahi hua — par delete kar dena
achhi aadat hai.

---

**Aage padho:** [PHONE.md](PHONE.md) · [DEPLOY.md](DEPLOY.md) · [docs/COMMANDS.md](docs/COMMANDS.md)
