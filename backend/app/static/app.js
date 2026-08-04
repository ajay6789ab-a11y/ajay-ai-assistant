/* ==========================================================================
   Ajay AI Assistant — web client
   ---------------------------------------------------------------------------
   This file is the browser twin of the Flutter app: it drives the same four
   screens, calls the same REST API, uses the Web Speech API where the phone
   uses `speech_to_text` / `flutter_tts`, and executes the same ACTION contract
   returned by the backend brain.
   ========================================================================== */

'use strict';

/* --------------------------------------------------------------------------
 * 1. Tiny helpers
 * ----------------------------------------------------------------------- */
const $ = (id) => document.getElementById(id);
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html !== undefined) n.innerHTML = html;
  return n;
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const state = {
  token: null,
  user: null,
  settings: {},
  voices: [],
  languages: [],
  engine: 'rules',
  listening: false,
  busy: false,
  level: 0,          // live mic loudness 0..1 (drives the orb)
  mode: 'idle',      // idle | listening | thinking | speaking
  pendingAction: null,
};

/* --------------------------------------------------------------------------
 * 2. API client (bearer token, guest device auth)
 * ----------------------------------------------------------------------- */
/**
 * Where the FastAPI backend lives.
 *
 * Default = same origin, which is correct when the backend serves this page
 * (local dev, Render, Railway, Docker). When the UI is hosted separately —
 * e.g. static hosting on Netlify/Vercel — set the backend URL by adding
 *   <meta name="ajay-api-base" content="https://your-backend.onrender.com">
 * to index.html, or define window.AJAY_API_BASE before this script loads.
 *
 * Note: Netlify can only serve these static files. It CANNOT run the Python
 * backend, so one of the two options above (or the /api/* proxy configured in
 * netlify.toml) is required there.
 */
const API_BASE = (() => {
  if (typeof window !== 'undefined' && window.AJAY_API_BASE) {
    return String(window.AJAY_API_BASE).replace(/\/+$/, '');
  }
  const meta = document.querySelector('meta[name="ajay-api-base"]');
  const fromMeta = meta && meta.getAttribute('content');
  if (fromMeta && !fromMeta.startsWith('__')) return fromMeta.replace(/\/+$/, '');
  return location.origin;
})();

const api = {
  async call(path, { method = 'GET', body, params } = {}) {
    const url = new URL(path, API_BASE + '/');
    if (params) Object.entries(params).forEach(([k, v]) => v != null && url.searchParams.set(k, v));
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw Object.assign(new Error(`${res.status}`), { status: res.status, body: await res.text() });
    return res.status === 204 ? null : res.json();
  },
  get: (p, params) => api.call(p, { params }),
  post: (p, body) => api.call(p, { method: 'POST', body }),
  patch: (p, body) => api.call(p, { method: 'PATCH', body }),
  del: (p) => api.call(p, { method: 'DELETE' }),
};

/** Anonymous device login — mirrors SecureStorage on the phone. */
async function authenticate() {
  let deviceId = localStorage.getItem('ajay.device');
  if (!deviceId) {
    deviceId = 'web-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem('ajay.device', deviceId);
  }
  const out = await api.post('/api/auth/guest', { device_id: deviceId, name: 'Friend' });
  state.token = out.access_token;
  state.user = out.user;
}

/* --------------------------------------------------------------------------
 * 3. The animated AI orb (canvas)
 *    idle      → slow breathing rings
 *    listening → waveform reacting to microphone level
 *    thinking  → fast orbiting particles
 *    speaking  → outward pulses
 * ----------------------------------------------------------------------- */
const orb = (() => {
  const canvas = $('orb');
  const ctx = canvas.getContext('2d');
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  const SIZE = 260;
  canvas.width = SIZE * DPR;
  canvas.height = SIZE * DPR;
  ctx.scale(DPR, DPR);

  const cx = SIZE / 2, cy = SIZE / 2;
  let t = 0, smooth = 0;

  const particles = Array.from({ length: 46 }, () => ({
    a: Math.random() * Math.PI * 2,
    r: 60 + Math.random() * 46,
    s: 0.002 + Math.random() * 0.01,
    z: 0.6 + Math.random() * 1.8,
  }));

  const PALETTE = {
    idle:      ['rgba(56,189,248,', 'rgba(167,139,250,'],
    listening: ['rgba(94,234,212,', 'rgba(56,189,248,'],
    thinking:  ['rgba(167,139,250,', 'rgba(244,114,182,'],
    speaking:  ['rgba(244,114,182,', 'rgba(167,139,250,'],
  };

  function frame() {
    t += 0.016;
    const target = state.mode === 'listening' ? 0.35 + state.level * 0.9
      : state.mode === 'thinking' ? 0.55
      : state.mode === 'speaking' ? 0.45 + Math.abs(Math.sin(t * 5)) * 0.35
      : 0.2;
    smooth += (target - smooth) * 0.09;                       // eased energy

    const [c1, c2] = PALETTE[state.mode] || PALETTE.idle;
    ctx.clearRect(0, 0, SIZE, SIZE);

    /* --- soft core glow ------------------------------------------------ */
    const baseR = 52 + smooth * 16;
    const glow = ctx.createRadialGradient(cx, cy, 4, cx, cy, baseR * 2.5);
    glow.addColorStop(0, c1 + (0.55 + smooth * 0.4) + ')');
    glow.addColorStop(0.45, c2 + (0.18 + smooth * 0.16) + ')');
    glow.addColorStop(1, 'rgba(4,6,15,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(cx, cy, baseR * 2.5, 0, Math.PI * 2); ctx.fill();

    /* --- inner sphere --------------------------------------------------- */
    const sphere = ctx.createRadialGradient(cx - 14, cy - 16, 6, cx, cy, baseR);
    sphere.addColorStop(0, 'rgba(255,255,255,.92)');
    sphere.addColorStop(0.35, c1 + '.75)');
    sphere.addColorStop(1, c2 + '.12)');
    ctx.fillStyle = sphere;
    ctx.beginPath(); ctx.arc(cx, cy, baseR * 0.52, 0, Math.PI * 2); ctx.fill();

    /* --- concentric waveform rings -------------------------------------- */
    for (let ring = 0; ring < 4; ring++) {
      const rad = baseR + 12 + ring * 15;
      const amp = (3 + smooth * 19) * (1 - ring * 0.14);
      const speed = t * (1.1 + ring * 0.32) * (state.mode === 'thinking' ? 2.1 : 1);
      ctx.beginPath();
      for (let a = 0; a <= Math.PI * 2 + 0.05; a += 0.055) {
        const wobble =
          Math.sin(a * (3 + ring) + speed) * amp +
          Math.sin(a * (7 - ring) - speed * 1.5) * amp * 0.4;
        const r = rad + wobble;
        const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
        a === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = (ring % 2 ? c2 : c1) + (0.4 - ring * 0.07 + smooth * 0.22) + ')';
      ctx.lineWidth = ring === 0 ? 2 : 1.2;
      ctx.stroke();
    }

    /* --- orbiting particles --------------------------------------------- */
    particles.forEach((p) => {
      p.a += p.s * (state.mode === 'thinking' ? 3.4 : state.mode === 'listening' ? 1.8 : 1);
      const rr = p.r + Math.sin(t * 1.6 + p.a * 3) * (4 + smooth * 12);
      const x = cx + Math.cos(p.a) * rr, y = cy + Math.sin(p.a) * rr * 0.94;
      ctx.beginPath();
      ctx.arc(x, y, p.z * (0.7 + smooth * 0.9), 0, Math.PI * 2);
      ctx.fillStyle = c1 + (0.25 + smooth * 0.5) + ')';
      ctx.fill();
    });

    /* --- speaking pulses ------------------------------------------------- */
    if (state.mode === 'speaking' || state.mode === 'listening') {
      const phase = (t * 0.8) % 1;
      ctx.beginPath();
      ctx.arc(cx, cy, baseR + phase * 68, 0, Math.PI * 2);
      ctx.strokeStyle = c1 + (0.34 * (1 - phase)) + ')';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    requestAnimationFrame(frame);
  }
  frame();
  return {};
})();

function setMode(mode) {
  state.mode = mode;
  const wrap = $('screen');
  wrap.classList.remove('listening', 'thinking', 'speaking');
  if (mode !== 'idle') wrap.classList.add(mode);
  $('orbState').textContent = {
    idle: 'tap to speak', listening: 'listening…',
    thinking: 'thinking…', speaking: 'speaking',
  }[mode];
  $('chatMic').classList.toggle('on', mode === 'listening');
}

/* --------------------------------------------------------------------------
 * 4. Speech-to-text (Web Speech API ≈ `speech_to_text` on Android)
 * ----------------------------------------------------------------------- */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null, micStream = null, analyser = null, rafLevel = null;

function sttLanguage() {
  const pref = state.settings.language;
  if (pref === 'hi-IN') return 'hi-IN';
  if (pref === 'en-IN') return 'en-IN';
  return localStorage.getItem('ajay.sttlang') || 'en-IN';   // auto → last used
}

async function startMicLevel() {
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const AC = window.AudioContext || window.webkitAudioContext;
    const actx = new AC();
    const src = actx.createMediaStreamSource(micStream);
    analyser = actx.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser);
    const buf = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += (v - 128) ** 2;
      state.level = Math.min(1, Math.sqrt(sum / buf.length) / 22);
      rafLevel = requestAnimationFrame(tick);
    };
    tick();
  } catch { /* no mic permission → the orb falls back to synthetic motion */ }
}

function stopMicLevel() {
  cancelAnimationFrame(rafLevel);
  micStream?.getTracks().forEach((t) => t.stop());
  micStream = null; analyser = null; state.level = 0;
}

function startListening() {
  if (state.listening || state.busy) return;

  // Browsers only expose the microphone in a "secure context": HTTPS, or the
  // localhost/127.0.0.1 loopback. A plain-HTTP LAN address such as
  // http://192.168.1.7:8000 is NOT secure, so opening the app on your phone
  // over WiFi silently kills voice input. Say so plainly instead of showing a
  // misleading "your browser is unsupported" message.
  if (!window.isSecureContext) {
    toast('Mic needs HTTPS. Typing works fine — see DEPLOY.md to host over HTTPS.', 6000);
    switchView('chat'); $('chatInput').focus();
    return;
  }
  if (!SR) {
    toast('Voice input needs Chrome or Edge — type your command instead.');
    switchView('chat'); $('chatInput').focus();
    return;
  }
  recognition = new SR();
  recognition.lang = sttLanguage();
  recognition.interimResults = true;
  recognition.continuous = false;
  recognition.maxAlternatives = 1;

  let finalText = '';
  recognition.onstart = () => {
    state.listening = true;
    setMode('listening');
    showTranscript('<span class="ghost">Listening…</span>');
    startMicLevel();
  };
  recognition.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      r.isFinal ? (finalText += r[0].transcript) : (interim += r[0].transcript);
    }
    showTranscript(esc(finalText) + `<span class="ghost">${esc(interim)}</span>`);
  };
  recognition.onerror = (e) => {
    stopListening();
    if (e.error === 'not-allowed') {
      toast('Microphone blocked. Open the preview in a new tab to allow it.');
    } else if (e.error !== 'aborted' && e.error !== 'no-speech') {
      toast('Could not hear that — try again.');
    }
    setTimeout(() => hideTranscript(), 900);
  };
  recognition.onend = () => {
    stopListening();
    const said = finalText.trim();
    if (said) { hideTranscript(); send(said, 'voice'); }
    else setTimeout(hideTranscript, 700);
  };
  try { recognition.start(); } catch { /* already running */ }
}

function stopListening() {
  state.listening = false;
  stopMicLevel();
  if (state.mode === 'listening') setMode('idle');
}

function toggleListening() {
  state.listening ? recognition?.stop() : startListening();
}

const showTranscript = (html) => { const n = $('transcript'); n.innerHTML = html; n.classList.add('show'); };
const hideTranscript = () => $('transcript').classList.remove('show');

/* --------------------------------------------------------------------------
 * 5. Text-to-speech (≈ `flutter_tts` on Android)
 * ----------------------------------------------------------------------- */
function pickVoice(lang) {
  const all = speechSynthesis.getVoices();
  const wantHindi = lang === 'hi';
  const wantMale = (state.settings.voice || '').startsWith('male');
  const pool = all.filter((v) => (wantHindi ? /^hi/i.test(v.lang) : /^en/i.test(v.lang)));
  const byGender = pool.filter((v) => wantMale
    ? /male|arjun|kabir|ravi|hemant/i.test(v.name) && !/female/i.test(v.name)
    : /female|aria|meera|swara|heera|zira|samantha|google/i.test(v.name));
  return byGender[0] || pool[0] || all[0] || null;
}

function speak(text, lang = 'en') {
  if (!state.settings.auto_speak_replies || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/[*_`#]/g, ''));
  const v = pickVoice(lang);
  if (v) u.voice = v;
  u.lang = lang === 'hi' ? 'hi-IN' : 'en-IN';
  u.rate = Math.max(0.5, (state.settings.speech_rate ?? 0.48) * 2);   // 0..1 → 0..2
  u.pitch = state.settings.pitch ?? 1;
  u.onstart = () => setMode('speaking');
  u.onend = () => { if (state.mode === 'speaking') setMode('idle'); };
  speechSynthesis.speak(u);
}

/* --------------------------------------------------------------------------
 * 6. Conversation
 * ----------------------------------------------------------------------- */
const ICONS = {
  call: '📞', message: '💬', open_app: '📱', web_search: '🔎', youtube_search: '▶️',
  alarm: '⏰', timer: '⏱', camera: '📷', gallery: '🖼', files: '📁', reminder: '🔔',
  task: '✅', note: '📝', planner: '🗓', weather: '🌤', news: '📰', translate: '🌐',
  calculate: '🧮', settings: '⚙️', navigate: '🧭', music: '🎵', flashlight: '🔦',
  battery: '🔋', greeting: '👋', help: '💡', chat: '✨',
};

function addMessage(role, text, extra = {}) {
  const wrap = el('div', `msg ${role === 'user' ? 'me' : 'ai'}`);
  const who = el('div', 'who', role === 'user' ? 'You'.slice(0, 1) : 'A');
  const col = el('div');
  const bubble = el('div', 'bubble', esc(text).replace(/\n/g, '<br>'));
  col.appendChild(bubble);

  if (extra.card) col.appendChild(extra.card);
  if (extra.action && extra.action !== 'SPEAK_ONLY') {
    col.appendChild(el('div', 'action-chip',
      `<span>${ICONS[extra.intent] || '⚡'}</span> ${esc(extra.action.replace(/_/g, ' '))}`));
  }
  if (extra.meta) col.appendChild(el('div', 'meta', extra.meta));

  wrap.append(who, col);
  $('chatScroll').appendChild(wrap);
  $('chatScroll').scrollTop = $('chatScroll').scrollHeight;
  return wrap;
}

function typingBubble() {
  const wrap = el('div', 'msg ai');
  wrap.append(el('div', 'who', 'A'), el('div', 'bubble', '<div class="typing"><i></i><i></i><i></i></div>'));
  $('chatScroll').appendChild(wrap);
  $('chatScroll').scrollTop = $('chatScroll').scrollHeight;
  return wrap;
}

/** Rich result cards (weather / news / calculator / translation). */
function buildCard(data) {
  if (data.weather?.ok) {
    const w = data.weather;
    const card = el('div', 'card', `
      <div class="ct">Weather · ${esc(w.city)}</div>
      <div class="wx">
        <div class="ico">${w.icon || '🌤'}</div>
        <div><div class="t">${w.temp_c}°</div><div class="d">${esc(w.description)} · feels ${w.feels_like_c}°</div></div>
      </div>
      <div class="wx-days">${(w.forecast || []).slice(0, 3).map((d) => `
        <div>${new Date(d.date).toLocaleDateString(undefined, { weekday: 'short' })}
        <b>${d.icon} ${d.max}°</b></div>`).join('')}</div>`);
    return card;
  }
  if (data.news?.ok) {
    return el('div', 'card', `
      <div class="ct">Top headlines · ${esc(data.news.topic)}</div>
      ${data.news.articles.slice(0, 4).map((a, i) => `
        <div class="news-item"><span>${i + 1}</span><div>${esc(a.title)}
        <small>${esc(a.source)}</small></div></div>`).join('')}`);
  }
  if (data.calculator?.ok) {
    return el('div', 'card', `<div class="ct">Calculator</div>
      <div class="wx"><div><div class="t">${esc(String(data.calculator.result))}</div>
      <div class="d">${esc(data.calculator.expression)}</div></div></div>`);
  }
  if (data.translate?.ok) {
    return el('div', 'card', `<div class="ct">Translation · ${esc(data.translate.target)}</div>
      <div style="font-size:17px;margin-top:6px">${esc(data.translate.translated)}</div>
      <div class="d" style="font-size:12px;color:var(--text-faint);margin-top:4px">${esc(data.translate.original)}</div>`);
  }
  return null;
}

async function send(text, source = 'text') {
  if (!text.trim() || state.busy) return;
  state.busy = true;
  switchView('chat');
  addMessage('user', text);
  const typing = typingBubble();
  setMode('thinking');

  try {
    const res = await api.post('/api/assistant/chat', {
      text, source, client_time: new Date().toISOString(),
    });
    typing.remove();
    state.engine = res.engine;
    $('enginePill').textContent = res.engine === 'llm' ? 'GPT' : 'on-device';
    $('engineDot').className = 'dot' + (res.engine === 'llm' ? '' : ' warn');

    addMessage('assistant', res.reply, {
      card: buildCard(res.data || {}),
      action: res.action?.type,
      intent: res.intent,
      meta: `<b>${res.intent}</b> · ${Math.round(res.confidence * 100)}% · ${res.language.toUpperCase()} · ${res.engine}`,
    });
    if (res.speak) speak(res.reply, res.language); else setMode('idle');
    if (source === 'voice') localStorage.setItem('ajay.sttlang', res.language === 'hi' ? 'hi-IN' : 'en-IN');

    handleAction(res.action, res);
    refreshHistory();
  } catch (err) {
    typing.remove();
    addMessage('assistant', '⚠️ I could not reach my brain just now. Please try again.');
    setMode('idle');
  } finally {
    state.busy = false;
  }
}

/* --------------------------------------------------------------------------
 * 7. Action execution + the consent sheet
 *    On Android these map to intents (`url_launcher`, `android_intent_plus`).
 *    In the browser we open URLs and explain the native behaviour.
 * ----------------------------------------------------------------------- */
function handleAction(action, res) {
  if (!action || action.type === 'SPEAK_ONLY') return;
  if (action.requires_confirmation) return askConsent(action);
  runAction(action);
}

function askConsent(action) {
  state.pendingAction = action;
  const p = action.params || {};
  const isCall = action.type === 'CALL';
  $('sheetIcon').textContent = isCall ? '📞' : '💬';
  $('sheetTitle').textContent = action.confirmation_prompt
    || (isCall ? `Call ${p.contact}?` : `Send message to ${p.contact}?`);
  $('sheetBody').textContent = isCall
    ? 'Ajay needs the CALL_PHONE permission and your explicit confirmation. Nothing is dialled until you allow it.'
    : 'Ajay will open your messaging app with this text pre-filled. You send it — the app never sends silently.';
  $('sheetPayload').innerHTML = isCall
    ? `<b>Contact</b> ${esc(p.contact || '—')}<br><b>Number</b> ${esc(p.number || 'from your contacts')}<br><b>Permission</b> android.permission.CALL_PHONE`
    : `<b>To</b> ${esc(p.contact || '—')}<br><b>Channel</b> ${esc((p.channel || 'sms').toUpperCase())}<br><b>Message</b> ${esc(p.body || '(dictate after confirming)')}`;
  $('sheetBackdrop').classList.add('show');
}

function runAction(action) {
  const p = action.params || {};
  const open = (url) => window.open(url, '_blank', 'noopener');
  switch (action.type) {
    // On a phone browser, tel:/sms:/wa.me links really do hand off to the
    // dialer, the SMS app and WhatsApp. That only works when we actually have
    // a number: the browser cannot read your contacts, so "call Rahul" can't
    // be resolved here — the Android APK does that with READ_CONTACTS.
    case 'CALL':
      if (p.number) {
        toast(`📞 Opening dialler for ${p.contact}…`);
        location.href = `tel:${String(p.number).replace(/[^\d+]/g, '')}`;
      } else {
        toast(`📞 "${p.contact}" ka number chahiye. Browser contacts nahi padh sakta — number bolo, ya APK use karo.`, 6000);
      }
      break;
    case 'SMS':
    case 'WHATSAPP': {
      const num = String(p.number || p.contact || '').replace(/[^\d+]/g, '');
      const body = encodeURIComponent(p.body || '');
      if (num.length >= 7) {
        if (action.type === 'WHATSAPP') {
          open(`https://wa.me/${num.replace(/^\+/, '')}${body ? `?text=${body}` : ''}`);
        } else {
          location.href = `sms:${num}${body ? `?body=${body}` : ''}`;
        }
        toast(`💬 Opening ${action.type === 'SMS' ? 'Messages' : 'WhatsApp'}…`);
      } else {
        toast(`💬 "${p.contact}" ka number chahiye. Browser contacts nahi padh sakta — number bolo, ya APK use karo.`, 6000);
      }
      break;
    }
    case 'OPEN_APP':
      if (p.url) open(p.url);
      toast(`📱 Launching ${p.app} · ${p.package || 'package lookup'}`); break;
    case 'WEB_SEARCH':
      open(`https://www.google.com/search?q=${encodeURIComponent(p.query || '')}`); break;
    case 'YOUTUBE_SEARCH':
      open(`https://www.youtube.com/results?search_query=${encodeURIComponent(p.query || '')}`); break;
    case 'NAVIGATE':
      open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(p.place || '')}`); break;
    case 'OPEN_URL':
      if (action.url) open(action.url); break;
    case 'SET_ALARM':
      toast(`⏰ Alarm set for ${String(p.hour).padStart(2, '0')}:${String(p.minute ?? 0).padStart(2, '0')} (AlarmClock intent)`); break;
    case 'SET_TIMER':
      toast(`⏱ Timer running for ${Math.round((p.seconds || 0) / 60)} min`); break;
    case 'OPEN_CAMERA':
      toast('📷 Camera opened (MediaStore.ACTION_IMAGE_CAPTURE)'); break;
    case 'OPEN_GALLERY':
      toast('🖼 Gallery opened (ACTION_PICK · READ_MEDIA_IMAGES)'); break;
    case 'OPEN_FILES':
      toast('📁 Files app opened (ACTION_OPEN_DOCUMENT)'); break;
    case 'OPEN_SETTINGS':
      toast(`⚙️ ${p.page || 'Phone'} settings (${p.intent || 'android.settings.SETTINGS'})`); break;
    case 'CREATE_REMINDER':
      toast(`🔔 Reminder saved · notification scheduled`); refreshHistory(); break;
    case 'CREATE_TASK':
      toast('✅ Added to your to-do list'); break;
    case 'CREATE_NOTE':
      toast('📝 Note saved'); break;
    case 'PLAY_MUSIC':
      open(`https://www.youtube.com/results?search_query=${encodeURIComponent(p.query || 'music')}`); break;
    case 'TOGGLE_FLASHLIGHT':
      toast(`🔦 Torch ${p.on ? 'on' : 'off'} (CameraManager)`); break;
    case 'BATTERY_STATUS':
      toast('🔋 Battery status read from BatteryManager'); break;
    default:
      break;
  }
}

$('sheetAllow').onclick = () => {
  $('sheetBackdrop').classList.remove('show');
  if (state.pendingAction) runAction(state.pendingAction);
  state.pendingAction = null;
};
$('sheetCancel').onclick = () => {
  $('sheetBackdrop').classList.remove('show');
  state.pendingAction = null;
  addMessage('assistant', 'Cancelled — nothing was sent.');
  toast('Cancelled. Your privacy is respected.');
};

let toastTimer;
function toast(msg, ms = 3200) {
  const n = $('toast');
  n.textContent = msg;
  n.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => n.classList.remove('show'), ms);
}

/* --------------------------------------------------------------------------
 * 8. Screens
 * ----------------------------------------------------------------------- */
function switchView(name) {
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${name}`));
  document.querySelectorAll('.nav button').forEach((b) => b.classList.toggle('on', b.dataset.view === name));
  if (name === 'history') refreshHistory();
  if (name === 'settings') loadMemory();
}
$('nav').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (btn) switchView(btn.dataset.view);
});

/* ---- Home ---------------------------------------------------------------- */
const QUICK_ICONS = {
  cloud: '<path d="M6 17h11a3.5 3.5 0 0 0 .3-7 5 5 0 0 0-9.6-1.3A4 4 0 0 0 6 17Z"/>',
  newspaper: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 9h7M7 13h7M17 9v6"/>',
  alarm: '<circle cx="12" cy="13" r="7"/><path d="M12 10v3.5l2 1.5M5 4 3 6M19 4l2 2"/>',
  camera: '<path d="M4 8h3l1.5-2h7L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.2"/>',
  photo: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.6"/><path d="m5 17 5-4 4 3 3-2 4 3"/>',
  planner: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 11h18M8 15h4"/>',
  app: '<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>',
  call: '<path d="M6 3h3l2 5-2.5 1.5a12 12 0 0 0 6 6L16 13l5 2v3a2 2 0 0 1-2.2 2A17 17 0 0 1 4 5.2 2 2 0 0 1 6 3Z"/>',
};

async function loadQuickActions() {
  try {
    const { suggestions } = await api.get('/api/assistant/suggestions');
    const grid = $('quickGrid');
    grid.innerHTML = '';
    suggestions.forEach((s) => {
      const b = el('button', 'quick', `
        <span class="qi"><svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round">${QUICK_ICONS[s.icon] || QUICK_ICONS.app}</svg></span>
        <span>${esc(s.label)}<small>${esc(s.command.slice(0, 26))}${s.command.length > 26 ? '…' : ''}</small></span>`);
      b.onclick = () => send(s.command, 'quick_action');
      grid.appendChild(b);
    });
  } catch { /* offline */ }
}

function updateGreeting() {
  const h = new Date().getHours();
  const part = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const name = state.user?.name && state.user.name !== 'Friend' ? `, ${state.user.name.split(' ')[0]}` : '';
  $('greeting').innerHTML = `${part}<b>${esc(name)}</b>`;
  $('avatar').textContent = (state.user?.name || 'A').trim()[0].toUpperCase();
}

/* ---- History ------------------------------------------------------------- */
let historyTimer;
async function refreshHistory(q = $('historySearch').value.trim()) {
  try {
    const [{ items }, stats] = await Promise.all([
      api.get('/api/history', { q: q || undefined, limit: 60 }),
      api.get('/api/history/stats'),
    ]);
    $('historyStats').innerHTML = `
      <div class="stat"><b>${stats.total}</b><span>commands</span></div>
      <div class="stat"><b>${stats.by_intent[0]?.intent || '—'}</b><span>top intent</span></div>
      <div class="stat"><b>${(stats.by_source.find((s) => s.source === 'voice') || {}).c || 0}</b><span>by voice</span></div>`;

    const list = $('historyList');
    list.innerHTML = '';
    if (!items.length) {
      list.innerHTML = `<div class="sub" style="text-align:center;padding:26px 0">
        ${q ? 'No matching commands.' : 'Your commands will appear here.'}</div>`;
      return;
    }
    items.forEach((it, i) => {
      const when = new Date(it.created_at + (it.created_at.endsWith('Z') ? '' : 'Z'));
      const node = el('div', 'hist-item', `
        <div class="hi">${ICONS[it.intent] || '⚡'}</div>
        <div class="hc">
          <div class="cmd">${esc(it.command)}</div>
          <div class="rep">${esc(it.reply || '')}</div>
          <div class="tm">${when.toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} · ${it.source}</div>
        </div>
        <div class="tag">${esc(it.intent || 'chat')}</div>`);
      node.style.animationDelay = `${Math.min(i * 25, 300)}ms`;
      node.onclick = () => send(it.command, 'text');
      list.appendChild(node);
    });
  } catch { /* offline */ }
}
$('historySearch').addEventListener('input', () => {
  clearTimeout(historyTimer);
  historyTimer = setTimeout(() => refreshHistory(), 240);
});

/* ---- Settings ------------------------------------------------------------ */
async function loadSettings() {
  const data = await api.get('/api/settings');
  state.settings = data.settings;
  state.voices = data.voices;
  state.languages = data.languages;

  $('setVoice').innerHTML = data.voices
    .map((v) => `<option value="${v.id}">${esc(v.label)}</option>`).join('');
  $('setLanguage').innerHTML = data.languages
    .map((l) => `<option value="${l.id}">${esc(l.label)}</option>`).join('');

  applySettingsToUI();
}

function applySettingsToUI() {
  const s = state.settings;
  $('setVoice').value = s.voice;
  $('setLanguage').value = s.language;
  $('setRate').value = s.speech_rate;
  $('setPitch').value = s.pitch;
  $('rateVal').textContent = `${(+s.speech_rate).toFixed(2)}×`;
  $('pitchVal').textContent = (+s.pitch).toFixed(2);
  $('setSpeak').checked = !!s.auto_speak_replies;
  $('setConfirmCalls').checked = !!s.confirm_calls;
  $('setConfirmMsgs').checked = !!s.confirm_messages;
  $('setHistory').checked = !!s.save_history;
  $('setMemory').checked = !!s.personalised_memory;
}

async function patchSettings(patch, spokenPreview) {
  const { settings } = await api.patch('/api/settings', patch);
  state.settings = settings;
  applySettingsToUI();
  if (spokenPreview) speak(spokenPreview, state.settings.language === 'hi-IN' ? 'hi' : 'en');
}

$('setVoice').onchange = (e) => patchSettings({ voice: e.target.value }, 'Hello, this is my voice.');
$('setLanguage').onchange = (e) => patchSettings({ language: e.target.value },
  e.target.value === 'hi-IN' ? 'नमस्ते, मैं अजय हूँ।' : 'Hello, I am Ajay.');
$('setRate').oninput = (e) => { $('rateVal').textContent = `${(+e.target.value).toFixed(2)}×`; };
$('setRate').onchange = (e) => patchSettings({ speech_rate: +e.target.value }, 'This is my new speaking speed.');
$('setPitch').oninput = (e) => { $('pitchVal').textContent = (+e.target.value).toFixed(2); };
$('setPitch').onchange = (e) => patchSettings({ pitch: +e.target.value }, 'And this is my new pitch.');
$('setSpeak').onchange = (e) => patchSettings({ auto_speak_replies: e.target.checked });
$('setConfirmCalls').onchange = (e) => patchSettings({ confirm_calls: e.target.checked });
$('setConfirmMsgs').onchange = (e) => patchSettings({ confirm_messages: e.target.checked });
$('setHistory').onchange = (e) => patchSettings({ save_history: e.target.checked });
$('setMemory').onchange = (e) => patchSettings({ personalised_memory: e.target.checked });

async function loadMemory() {
  try {
    const { items, habits } = await api.get('/api/memory');
    const chips = $('memoryChips');
    chips.innerHTML = '';
    items.slice(0, 10).forEach((m) => chips.appendChild(
      el('span', 'mem-chip', `${esc(m.key.replace(/_/g, ' '))}: <b>${esc(m.value)}</b>`)));
    habits.apps.slice(0, 3).forEach((a) => chips.appendChild(
      el('span', 'mem-chip', `opens <b>${esc(a.name)}</b> ×${a.count}`)));
    if (!chips.children.length) {
      chips.innerHTML = '<span class="sub">Nothing learned yet — say “my name is …” or “I live in Delhi”.</span>';
    }
  } catch { /* offline */ }
}

$('wipeMemory').onclick = async () => {
  await api.del('/api/memory'); await loadMemory(); toast('🧠 All memories erased.');
};
$('clearHistory').onclick = async () => {
  await api.del('/api/history'); await refreshHistory(); toast('🗑 History cleared.');
};
$('deleteAccount').onclick = async () => {
  await api.del('/api/settings/account');
  localStorage.removeItem('ajay.device');
  toast('Account deleted. Reloading…');
  setTimeout(() => location.reload(), 1200);
};

/* --------------------------------------------------------------------------
 * 9. Wiring & boot
 * ----------------------------------------------------------------------- */
$('micBtn').onclick = toggleListening;
$('chatMic').onclick = toggleListening;
$('sendBtn').onclick = () => { const v = $('chatInput').value; $('chatInput').value = ''; send(v); };
$('chatInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { const v = $('chatInput').value; $('chatInput').value = ''; send(v); }
});
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && e.target === document.body) { e.preventDefault(); toggleListening(); }
});

const DEMO_COMMANDS = [
  'Call Rahul', 'Open YouTube', 'Search cricket news', 'Set alarm for 7 AM',
  "What's the weather in Delhi", 'राहुल को कॉल करो', 'यूट्यूब खोलो',
  'Translate good morning to Hindi', 'Calculate 25 * 4 + 10', 'Find my photos',
  'Remind me to call mom at 8 pm', 'Add task buy milk',
];
$('tryChips').innerHTML = DEMO_COMMANDS
  .map((c) => `<button data-cmd="${esc(c)}">${esc(c)}</button>`).join('');
$('tryChips').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b) send(b.dataset.cmd, 'text');
});

function tickClock() {
  $('clock').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
setInterval(tickClock, 10000); tickClock();

async function restoreConversation() {
  try {
    const { messages } = await api.get('/api/assistant/conversation', { limit: 30 });
    messages.forEach((m) => addMessage(m.role, m.content, { intent: m.intent }));
    if (!messages.length) {
      addMessage('assistant',
        'Namaste! I am Ajay — your voice assistant. Try “Open YouTube”, “Call Rahul”, ' +
        '“सुबह 7 बजे अलार्म लगाओ” or ask me anything.');
    }
  } catch { /* offline */ }
}

(async function boot() {
  try {
    const health = await api.get('/api/health');
    state.engine = health.ai_engine;
    $('engine-line').textContent = health.ai_engine === 'llm'
      ? `GPT brain online · ${health.model}`
      : 'On-device brain · add an API key for GPT';
    $('enginePill').textContent = health.ai_engine === 'llm' ? 'GPT' : 'on-device';
    $('engineDot').className = 'dot' + (health.ai_engine === 'llm' ? '' : ' warn');
    $('buildLine').textContent = `v${health.version} · ${health.ai_engine} engine · SQLite`;

    await authenticate();
    updateGreeting();
    await Promise.all([loadSettings(), loadQuickActions(), restoreConversation(), refreshHistory()]);
  } catch (err) {
    toast('Backend unreachable — start the FastAPI server.');
  } finally {
    setTimeout(() => $('splash').classList.add('gone'), 1400);
  }
})();

// Warm up the TTS voice list (Chrome loads them asynchronously).
speechSynthesis?.addEventListener?.('voiceschanged', () => {});
