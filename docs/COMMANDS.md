# Supported Commands

Ajay understands **English**, **Hindi (Devanagari)** and **Hinglish (romanised Hindi)**.
Anything not listed here falls through to the GPT brain, which can still return a
structured action.

Legend: 🔒 = requires an explicit confirmation sheet before it runs.

---

## 📞 Calling 🔒

| English | Hindi | Hinglish |
|---|---|---|
| Call Rahul | राहुल को कॉल करो | Rahul ko call karo |
| Dial 9876543210 | 9876543210 पर फोन करो | Rahul ko phone lagao |
| Phone mom | माँ को कॉल करो | mummy ko milao |

→ `CALL` · resolved number dials directly, otherwise the dialler opens pre-filled.

## 💬 Messaging 🔒

| English | Hindi |
|---|---|
| Send message to Amit | अमित को मैसेज भेजो |
| Text Priya saying I'm late | प्रिया को मैसेज भेजो कि मैं देर से आऊँगा |
| WhatsApp Rahul | राहुल को व्हाट्सएप करो |

→ `SMS` / `WHATSAPP` · the composer opens with the text pre-filled; you press send.

## 📱 Apps

| English | Hindi |
|---|---|
| Open YouTube | यूट्यूब खोलो |
| Launch Instagram | इंस्टाग्राम खोलो |
| Start WhatsApp | व्हाट्सएप चालू करो |

→ `OPEN_APP`. 25+ popular Indian apps are mapped to package names (YouTube,
WhatsApp, Instagram, Paytm, PhonePe, Zomato, Swiggy, Ola, Uber, Hotstar…).
Unknown apps fall back to a web search.

## 🔎 Search

| Command | Action |
|---|---|
| Search cricket news / क्रिकेट न्यूज़ खोजो | `SHOW_NEWS` (live headlines, spoken) |
| Search best phones under 20000 | `WEB_SEARCH` |
| Play Arijit Singh on YouTube | `YOUTUBE_SEARCH` |
| Google quantum computing | `WEB_SEARCH` |

> "Search **X** news" is routed to the news tool rather than a plain web search.

## ⏰ Alarms & timers

| Command | Result |
|---|---|
| Set alarm for 7 AM / सुबह 7 बजे अलार्म लगाओ | `SET_ALARM` 07:00 |
| Set alarm for 7:45 pm | 19:45 |
| raat 9 baje alarm lagao | 21:00 |
| Set a timer for 10 minutes | `SET_TIMER` 600 s |

Day-part words (`सुबह/subah`, `शाम/shaam`, `रात/raat`, `dopahar`) resolve AM/PM
when no meridiem is spoken. Times already past roll to tomorrow.

## 📷 Camera, photos & files

`Open camera` · `कैमरा खोलो` · `Take a selfie` → `OPEN_CAMERA`
`Find my photos` · `मेरी फोटो दिखाओ` → `OPEN_GALLERY`
`Open files` · `फाइल खोलो` → `OPEN_FILES`

## 🔔 Reminders, tasks & notes

| Command | Action |
|---|---|
| Remind me to call mom at 8 pm | `CREATE_REMINDER` + local notification |
| मुझे 6 बजे दवा की याद दिलाना | `CREATE_REMINDER` |
| Add task buy milk | `CREATE_TASK` |
| Add buy milk to my todo list | `CREATE_TASK` |
| put pay bills in my todo | `CREATE_TASK` |
| दूध लाना मेरी लिस्ट में जोड़ो | `CREATE_TASK` |
| doodh lana todo me add karo | `CREATE_TASK` |
| Note down meeting ideas | `CREATE_NOTE` |
| Show my tasks / Show my plan for today | `SHOW_PLANNER` |

Both word orders are understood — the item can come *before* the keyword
("add **buy milk** to my todo list") or *after* it ("add task **buy milk**"),
in English, Hindi or Hinglish.

Relative times work too: *"remind me in 20 minutes"*, *"20 मिनट बाद"*.

## 🌤 Weather

`What's the weather` · `Weather in Mumbai` · `दिल्ली का मौसम बताओ` · `mausam kaisa hai`
→ `SHOW_WEATHER` — live temperature, feels-like, condition and a 3-day outlook,
spoken in the language you used.

City names are understood in **either word order** — English places the city
after the preposition (*"weather in Delhi"*), Hindi places it before the
postposition (*"**दिल्ली** का मौसम"*). City names written in Devanagari are
transliterated (`दिल्ली → Delhi`, `कोच्चि → Kochi`) and Hindi queries are
biased to Indian results, so *"कोच्चि का मौसम"* returns Kochi in Kerala rather
than the same-named city in Japan. When no city is named, your saved default
city is used.

## 📰 News

`Latest news` · `Cricket news` · `खबरें बताओ` · `taza khabar`
→ `SHOW_NEWS` — top headlines with sources (Hindi feed when you speak Hindi).

## 🌐 Translation

| Command | Result |
|---|---|
| Translate good morning to Hindi | सुप्रभात |
| Translate मैं ठीक हूँ to English | I am fine |
| "thank you" ko french me translate karo | merci |

19 languages; a built-in phrasebook answers common phrases even with no network.

## 🧮 Calculator

`Calculate 25 * 4 + 10` → 110 · `What is 20 percent of 500` → 100 ·
`sqrt(144)` → 12 · `five plus three` → 8

Evaluated through a whitelisted AST — code injection is impossible.

## ⚙️ Settings & device

| Command | Opens |
|---|---|
| Open wifi settings / वाईफाई सेटिंग | `WIFI_SETTINGS` |
| Open bluetooth settings | `BLUETOOTH_SETTINGS` |
| Open battery settings | `POWER_USAGE_SUMMARY` |
| Open display / sound / location / storage / apps settings | matching page |
| Turn on the torch / टॉर्च जलाओ | `TOGGLE_FLASHLIGHT` |
| Battery status / बैटरी कितनी है | `BATTERY_STATUS` |

## 🧭 Navigation & music

`Navigate to India Gate` · `Directions to Connaught Place` → `NAVIGATE`
`Play some music` · `गाना बजाओ` → `PLAY_MUSIC`

## 💬 Conversation

`Hi` / `नमस्ते` · `Who are you?` / `तुम कौन हो?` · `What can you do?` ·
`What's the time?` / `कितने बजे हैं` · `What's today's date?` · `Thanks` / `शुक्रिया` ·
`Tell me a joke` · `Stop` / `रुको`

## 🧠 Teaching Ajay about you

Say any of these and it is remembered (visible & erasable in Settings):

- `My name is Ajay` / `मेरा नाम अजय है`
- `I live in Pune` / `मैं दिल्ली में रहता हूँ`
- `I like cricket`
- `I wake up at 6:30`

---

## Confidence & routing

| Score | Meaning |
|---|---|
| ≥ 0.90 | Precise pattern match — executed immediately |
| 0.80–0.89 | Confident match, still rules-only |
| < 0.80 | Handed to GPT (or the offline small-talk fallback) |

Every reply shows its intent, confidence, language and engine under the bubble,
which makes debugging new phrasings trivial.
