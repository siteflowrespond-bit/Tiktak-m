// flock.tt (c) 2026 siteflowrespond-bit. Owner proof sha256:99891628516a57a623400d9ccde22b170ecfac1527631e923149d480260a9270
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import { loadConfig, saveConfig, cleanConfig, merge, writeFileSafe, DATA_DIR } from './config.js';
import { TikTokSource } from './tiktok.js';
import { Engine } from './engine.js';
import { ObsLink } from './obs.js';
import { simulate, SIM_GIFTS } from './simulate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VERSION = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')).version; } catch { return ''; } })();
const PORT = Number(process.env.PORT) || 8787;
const HOST = process.env.HOST || '127.0.0.1';

let config = loadConfig();
const app = express();
const server = http.createServer(app);

// ---- Security ----
// flock.tt listens on this computer only. Any website open in your browser can still try to talk to
// http://127.0.0.1:8787, so requests must come from flock.tt itself (or from OBS / LIVE Studio, which send no Origin).
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
const LAN_MODE = !LOOPBACK.has(HOST);
const hostOf = (h = '') => h.replace(/:\d+$/, '').toLowerCase();
function trustedHost(hostHeader) {
  // Blocks DNS rebinding (evil.example resolving to 127.0.0.1). In LAN mode the user chose to open it up.
  return LAN_MODE || LOOPBACK.has(hostOf(hostHeader));
}
function trustedOrigin(origin, hostHeader) {
  if (!origin) return true; // OBS, LIVE Studio and same-origin GETs
  if (origin === 'null') return false;
  try { return new URL(origin).host.toLowerCase() === String(hostHeader || '').toLowerCase(); } catch { return false; }
}

const io = new Server(server, {
  maxHttpBufferSize: 1e5,
  allowRequest: (req, cb) => cb(null, trustedHost(req.headers.host) && trustedOrigin(req.headers.origin, req.headers.host))
});

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const SOUND_DIRS = { builtin: path.join(PUBLIC_DIR, 'sounds', 'builtin'), custom: path.join(DATA_DIR, 'sounds', 'custom') };
const AUDIO_EXT = /\.(mp3|wav|ogg|m4a|webm)$/i;
fs.mkdirSync(SOUND_DIRS.custom, { recursive: true });
// Uploads used to live in public/sounds/custom; move any old ones to the data folder once.
try {
  const old = path.join(PUBLIC_DIR, 'sounds', 'custom');
  if (fs.existsSync(old) && !fs.readdirSync(SOUND_DIRS.custom).length) for (const f of fs.readdirSync(old)) fs.copyFileSync(path.join(old, f), path.join(SOUND_DIRS.custom, f));
} catch { /* read-only install folder: nothing to move */ }

app.disable('x-powered-by');
app.use((req, res, next) => {
  if (!trustedHost(req.headers.host)) return res.status(421).send('Misdirected request');
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Resource-Policy': 'same-origin'
  });
  // The dashboard can't be framed by other sites (clickjacking). Overlays stay embeddable.
  if (!req.path.startsWith('/overlays/') && !req.path.startsWith('/sounds/')) res.set('X-Frame-Options', 'SAMEORIGIN');
  if (req.path.startsWith('/api/')) {
    res.set('Cache-Control', 'no-store');
    const writes = req.method !== 'GET' && req.method !== 'HEAD';
    if (writes && (!trustedOrigin(req.headers.origin, req.headers.host) || req.headers['sec-fetch-site'] === 'cross-site')) {
      return res.status(403).json({ error: 'Blocked: this request did not come from flock.tt' });
    }
  }
  next();
});
// A runaway script (or a flood) gets slowed down instead of freezing the app.
const hits = new Map();
setInterval(() => hits.clear(), 60_000).unref();
app.use('/api/', (req, res, next) => {
  const key = req.socket.remoteAddress || '?';
  const n = (hits.get(key) || 0) + 1;
  hits.set(key, n);
  if (n > 1200) return res.status(429).json({ error: 'Too many requests, slow down' });
  next();
});
app.use(express.json({ limit: '1mb' }));
app.use('/sounds/custom', express.static(SOUND_DIRS.custom));
app.use(express.static(PUBLIC_DIR));

const tiktok = new TikTokSource();
const engine = new Engine(() => config);

// ---- Wiring: TikTok -> engine -> all browser clients ----
// ---- Gift pictures ----
// TikTok sends each gift's picture link with the room's gift catalogue. Keep the last catalogue on disk so
// test gifts (and any real gift that arrives without a picture) can still show the real picture.
const GIFT_FILE = path.join(DATA_DIR, 'gift-catalog.json');
const GIFT_FALLBACK = '/overlays/gift.svg';
// flock.tt's own drawings for the test gifts (used when TikTok hasn't given us a picture)
const GIFT_ART = { rose: 'rose', tiktok: 'note', 'finger heart': 'finger-heart', doughnut: 'doughnut', 'hand hearts': 'hand-hearts', galaxy: 'galaxy', lion: 'lion' };
let giftCatalog = [];
try { giftCatalog = JSON.parse(fs.readFileSync(GIFT_FILE, 'utf8')).filter((g) => g && g.name); } catch { /* none saved yet */ }
const giftImages = () => new Map(giftCatalog.filter((g) => g.image).map((g) => [g.name.toLowerCase(), g.image]));
let giftImageByName = giftImages();
function rememberGifts(list) {
  if (!list?.length) return;
  const byName = new Map(giftCatalog.map((g) => [g.name, g]));
  for (const g of list) if (g.name) byName.set(g.name, { ...byName.get(g.name), ...g, image: g.image || byName.get(g.name)?.image || '' });
  giftCatalog = [...byName.values()].sort((a, b) => a.diamonds - b.diamonds);
  giftImageByName = giftImages();
  try { writeFileSafe(GIFT_FILE, JSON.stringify(giftCatalog)); } catch (e) { log(`Could not save gift pictures: ${e.message}`); }
}
/** Gives a gift event a picture: its own, else the saved one for that gift, else a plain gift-box icon. */
function withGiftImage(evt) {
  if (!evt?.gift || evt.gift.image) return evt;
  const key = String(evt.gift.name).toLowerCase();
  const art = GIFT_ART[key] && `/overlays/gifts/${GIFT_ART[key]}.svg`;
  return { ...evt, gift: { ...evt.gift, image: giftImageByName.get(key) || art || GIFT_FALLBACK } };
}

// One bad event (or a bug) must never take the whole app down mid-stream.
function handle(evt) {
  try { engine.handle(evt); } catch (e) { log(`Could not handle a ${evt?.type || 'unknown'} event: ${e.message}`); }
}
tiktok.on('event', (evt) => handle(withGiftImage(evt)));
tiktok.on('gifts', (list) => rememberGifts(list));
// Learn each gift's picture from real gift events, so test gifts can show it later too.
tiktok.on('event', (evt) => {
  const g = evt.gift;
  if (!g?.name || !g.image || giftImageByName.get(String(g.name).toLowerCase()) === g.image) return;
  rememberGifts([{ name: g.name, diamonds: g.diamonds || 0, image: g.image }]);
});
tiktok.on('status', (s) => { io.emit('status', s); log(`status: ${s.status} ${s.detail || ''}`); });
tiktok.on('log', log);
engine.on('event', (evt) => io.emit('event', evt));
engine.on('stats', (stats) => io.emit('stats', stats));
engine.on('alert', (a) => io.emit('alert', a));
engine.on('tts', (t) => io.emit('tts', t));
engine.on('ttsSkipped', (t) => io.emit('ttsSkipped', t));
engine.on('sound', (snd) => io.emit('sound', snd));
engine.on('timer', (t) => io.emit('timer', t));
engine.on('poll', (p) => io.emit('poll', p));
engine.on('pollHistory', (h) => io.emit('pollHistory', h));
// a stacking goal moved up: keep the new target and tell everyone
engine.on('goalsChanged', () => { try { saveConfig(config); } catch (e) { log(`Could not save goals: ${e.message}`); } io.emit('config', publicConfig()); });
engine.on('queue', (q) => io.emit('queue', q));

// ---- Wins & losses: kept on disk so the record carries over between streams ----
const RECORD_FILE = path.join(DATA_DIR, 'record.json');
let lastLoggedResult = 0;
try { const r = JSON.parse(fs.readFileSync(RECORD_FILE, 'utf8')); engine.record = { wins: 0, losses: 0, draws: 0, streak: 0, last: null, ...r }; } catch { /* first run */ }
engine.on('record', (r) => {
  io.emit('record', r);
  try { writeFileSafe(RECORD_FILE, JSON.stringify(r)); } catch (e) { log(`Could not save wins & losses: ${e.message}`); }
  if (r.last && r.last.at !== lastLoggedResult && Date.now() - r.last.at < 2000 && (lastLoggedResult = r.last.at)) log(`Record: ${r.last.result}${r.last.opponent ? ` vs ${r.last.opponent}` : ''} (${r.wins}W ${r.losses}L ${r.draws}D)`);
});

// ---- OBS ----
const obs = new ObsLink();
obs.on('status', (st) => { io.emit('obsStatus', st); log(`OBS: ${st.status} ${st.detail || ''}`); });
obs.on('log', (entry) => io.emit('obsLog', entry));
engine.on('obs', ({ action, why }) => obs.run(action, why).catch((e) => obs.log(`Could not run "${why}": ${e.message}`)));
if (config.obs?.autoConnect) obs.connect(config.obs).catch(() => {});

function log(msg) {
  console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
}

function publicConfig() {
  // Never ship secrets (API key, OBS password) to the browser or overlays.
  const { signApiKey, ...rest } = config;
  const { password, ...obsRest } = config.obs || {};
  return { ...rest, obs: obsRest, hasSignApiKey: Boolean(signApiKey), hasObsPassword: Boolean(password), appVersion: VERSION, dataDir: DATA_DIR };
}

// ---- Which overlays are open right now (LIVE Studio / OBS / a browser) ----
// Each overlay page's socket comes from its own URL. Editor/Overlays-page previews (preview=1) and the overlays
// inside a layout link (in=scene) are left out, so this counts what is really on stream.
const overlayPages = new Map(); // socket id -> { page, since }
function overlayList() {
  const counts = {};
  for (const { page } of overlayPages.values()) counts[page] = (counts[page] || 0) + 1;
  return Object.entries(counts).map(([page, count]) => ({ page, count }));
}
io.on('connection', (socket) => {
  try {
    const ref = new URL(String(socket.handshake.query?.ovpage || ''), 'http://x');
    if (ref.pathname.includes('/overlays/') && !ref.searchParams.has('preview') && !ref.searchParams.has('in')) {
      const file = ref.pathname.split('/').pop();
      const page = file === 'scene.html' ? `Layout: ${ref.searchParams.get('layout') || 'main'}` : file.replace('.html', '');
      overlayPages.set(socket.id, { page, since: Date.now() });
      io.emit('overlays', overlayList());
      socket.on('disconnect', () => { overlayPages.delete(socket.id); io.emit('overlays', overlayList()); });
    }
  } catch { /* not an overlay page */ }
  socket.emit('overlays', overlayList());
  socket.emit('status', { status: tiktok.status, username: tiktok.username });
  socket.emit('config', publicConfig());
  socket.emit('stats', engine.snapshot());
  socket.emit('recent', engine.recent);
  socket.emit('timer', engine.timerState());
  socket.emit('record', engine.record);
  socket.emit('poll', engine.pollState());
  socket.emit('pollHistory', engine.pollHistory);
  socket.emit('queue', engine.queue);
  socket.emit('obsStatus', { status: obs.status, detail: obs.detail });
});

// ---- REST API used by the dashboard ----
app.get('/api/config', (req, res) => res.json(publicConfig()));

// Gift catalogue: the real room's gifts when connected, a sample list otherwise.
app.get('/api/gifts', (req, res) => res.json(tiktok.gifts?.length ? tiktok.gifts : giftCatalog.length ? giftCatalog : SIM_GIFTS));

// ---- Sound library ----
app.get('/api/sounds', (req, res) => {
  const list = [];
  for (const [kind, dir] of Object.entries(SOUND_DIRS)) {
    for (const file of fs.readdirSync(dir).filter((f) => AUDIO_EXT.test(f)).sort()) {
      list.push({ kind, name: file.replace(AUDIO_EXT, ''), src: `/sounds/${kind}/${encodeURIComponent(file)}` });
    }
  }
  res.json(list);
});

app.post('/api/sounds', express.raw({ type: () => true, limit: '8mb' }), (req, res) => {
  const original = path.basename(String(req.query.name || ''));
  if (!AUDIO_EXT.test(original)) return res.status(400).json({ error: 'Use an mp3, wav, ogg, m4a or webm file' });
  if (!req.body?.length) return res.status(400).json({ error: 'The file is empty' });
  const safe = original.replace(/[^\w.\- ]+/g, '_').slice(-80);
  try { fs.writeFileSync(path.join(SOUND_DIRS.custom, safe), req.body); } catch (e) { return res.status(500).json({ error: `Could not save the sound: ${e.message}` }); }
  res.json({ kind: 'custom', name: safe.replace(AUDIO_EXT, ''), src: `/sounds/custom/${encodeURIComponent(safe)}` });
});

// ---- MyInstants: search it and add a sound to your own library ----
// Only ever talks to myinstants.com and only saves .mp3 files from its /media/sounds/ folder.
const MI = 'https://www.myinstants.com';
const MI_HOSTS = new Set(['www.myinstants.com', 'myinstants.com']);
const decodeHtml = (t) => String(t).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
async function miFetch(url, asBuffer = false) {
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (flock.tt sound picker)', Accept: asBuffer ? 'audio/mpeg,*/*' : 'text/html' }, signal: AbortSignal.timeout(12000), redirect: 'follow' });
  if (!r.ok) throw new Error(`MyInstants answered ${r.status}`);
  if (!asBuffer) return r.text();
  const len = Number(r.headers.get('content-length') || 0);
  if (len > 8 * 1024 * 1024) throw new Error('That sound is too big (over 8 MB)');
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > 8 * 1024 * 1024) throw new Error('That sound is too big (over 8 MB)');
  return buf;
}
const miMp3 = (raw) => {
  try { const u = new URL(raw, MI); return MI_HOSTS.has(u.hostname) && /^\/media\/sounds\/[^/]+\.mp3$/i.test(u.pathname) ? `${MI}${u.pathname}` : ''; } catch { return ''; }
};
/** Pulls the sounds off a MyInstants page: each one is a play('/media/sounds/x.mp3') button next to a link with its name. */
function miParse(html) {
  const out = [], seen = new Set();
  const blocks = html.split(/<div[^>]+class="[^"]*\binstant\b[^"]*"/i).slice(1);
  for (const b of blocks) {
    const mp3 = miMp3((/(\/media\/sounds\/[^'"\s)]+?\.mp3)/i.exec(b) || [])[1]);
    if (!mp3 || seen.has(mp3)) continue;
    const link = /<a[^>]+href="(\/[a-z]{2}\/instant\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(b);
    const title = decodeHtml(link ? link[2] : '') || decodeURIComponent(mp3.split('/').pop().replace(/\.mp3$/i, '')).replace(/[-_]+/g, ' ');
    seen.add(mp3);
    out.push({ title: title.slice(0, 80), mp3, page: link ? `${MI}${link[1]}` : '' });
  }
  // a page laid out differently: fall back to every mp3 on it
  if (!out.length) for (const m of html.matchAll(/(\/media\/sounds\/[^'"\s)]+?\.mp3)/gi)) {
    const mp3 = miMp3(m[1]);
    if (mp3 && !seen.has(mp3)) { seen.add(mp3); out.push({ title: decodeURIComponent(mp3.split('/').pop().replace(/\.mp3$/i, '')).replace(/[-_]+/g, ' '), mp3, page: '' }); }
  }
  return out.slice(0, 48);
}
app.get('/api/myinstants', async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 80);
  const url = q ? `${MI}/en/search/?name=${encodeURIComponent(q)}` : `${MI}/en/trending/`;
  try { res.json({ query: q, results: miParse(await miFetch(url)) }); }
  catch (e) { res.status(502).json({ error: `Couldn't reach MyInstants: ${e.message}. Check your internet connection.` }); }
});
app.post('/api/myinstants', async (req, res) => {
  const link = String(req.body?.url || '').trim();
  let mp3 = miMp3(link), name = String(req.body?.name || '').trim();
  try {
    if (!mp3) {
      // a page link (myinstants.com/en/instant/...): find the sound on that page
      let u; try { u = new URL(link); } catch { return res.status(400).json({ error: 'Paste a link from myinstants.com' }); }
      if (!MI_HOSTS.has(u.hostname) || !/^\/[a-z]{2}\/instant\//i.test(u.pathname)) return res.status(400).json({ error: 'Paste a link from myinstants.com' });
      const html = await miFetch(`${MI}${u.pathname}`);
      mp3 = miMp3((/(\/media\/sounds\/[^'"\s)]+?\.mp3)/i.exec(html) || [])[1]);
      if (!mp3) return res.status(404).json({ error: 'No sound found on that page' });
      if (!name) name = decodeHtml((/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html) || [])[1] || '');
    }
    const buf = await miFetch(mp3, true);
    if (buf.length < 200 || !(buf.slice(0, 3).toString() === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0))) return res.status(415).json({ error: 'That file is not an mp3 sound' });
    const base = (name || decodeURIComponent(mp3.split('/').pop().replace(/\.mp3$/i, ''))).replace(/[^\w.\- ]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'sound';
    let file = `${base}.mp3`, n = 2;
    while (fs.existsSync(path.join(SOUND_DIRS.custom, file))) file = `${base} ${n++}.mp3`;
    writeFileSafe(path.join(SOUND_DIRS.custom, file), buf);
    res.json({ kind: 'custom', name: file.replace(AUDIO_EXT, ''), src: `/sounds/custom/${encodeURIComponent(file)}` });
  } catch (e) { res.status(502).json({ error: `Couldn't get that sound: ${e.message}` }); }
});

app.delete('/api/sounds/:file', (req, res) => {
  const file = path.basename(req.params.file);
  const full = path.join(SOUND_DIRS.custom, file);
  if (!AUDIO_EXT.test(file) || !fs.existsSync(full)) return res.status(404).json({ error: 'Not found' });
  fs.unlinkSync(full);
  res.json({ ok: true });
});

app.post('/api/play-sound', (req, res) => {
  const { src, volume = 1 } = req.body || {};
  // only flock.tt's own sounds: overlays must never be told to fetch something from elsewhere
  if (typeof src !== 'string' || !src.startsWith('/sounds/') || src.includes('..')) return res.status(400).json({ error: 'No sound' });
  io.emit('sound', { src, volume: Math.max(0, Math.min(1, Number(volume) || 0)) * config.sounds.volume, times: 1 });
  res.json({ ok: true });
});

// ---- OBS ----
app.get('/api/obs', async (req, res) => {
  try { res.json({ status: obs.status, detail: obs.detail, ...(await obs.inventory()) }); } catch (e) { res.json({ status: obs.status, detail: e.message, scenes: [], inputs: [] }); }
});
app.post('/api/obs/connect', async (req, res) => {
  const { url, password, autoConnect } = req.body || {};
  config.obs = { ...config.obs, url: url || config.obs.url, autoConnect: autoConnect ?? config.obs.autoConnect, password: password || config.obs.password || '' };
  saveConfig(config);
  io.emit('config', publicConfig());
  try { await obs.connect(config.obs); res.json({ ok: true, ...(await obs.inventory()) }); } catch (e) { res.status(502).json({ error: e.message }); }
});
app.post('/api/obs/disconnect', async (req, res) => { await obs.disconnect(); res.json({ ok: true }); });
app.post('/api/obs/run', async (req, res) => {
  try { await obs.run(req.body?.action || {}, 'test'); res.json({ ok: true }); } catch (e) { res.status(400).json({ error: e.message }); }
});

// ---- Subathon timer ----
app.post('/api/timer', (req, res) => {
  const { action, seconds } = req.body || {};
  if (!['start', 'pause', 'reset', 'add'].includes(action)) return res.status(400).json({ error: 'Unknown timer action' });
  engine.timerAction(action, Math.max(-86400, Math.min(86400, Number(seconds) || 0)));
  res.json(engine.timerState());
});

app.put('/api/config', (req, res) => {
  const raw = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const signApiKey = typeof raw.signApiKey === 'string' && raw.signApiKey.trim() ? raw.signApiKey.trim() : config.signApiKey;
  const incoming = cleanConfig(raw); // wrong types and unknown settings are dropped
  delete incoming.signApiKey;
  if (incoming.obs) incoming.obs.password = incoming.obs.password || config.obs?.password || '';
  // nested settings merge (sending { tts: { voice } } keeps the rest of tts); lists are replaced
  config = { ...merge(config, incoming), signApiKey };
  saveConfig(config);
  io.emit('config', publicConfig());
  res.json(publicConfig());
});

// ---- Backup & restore: every setting except the secrets ----
app.get('/api/backup', (req, res) => {
  const { signApiKey, username, ...rest } = config;
  const { password, ...obsRest } = config.obs || {};
  res.set('Content-Disposition', `attachment; filename="flocktt-backup-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json({ app: 'flock.tt', version: VERSION, savedAt: new Date().toISOString(), config: { ...rest, obs: obsRest } });
});
app.post('/api/restore', (req, res) => {
  const b = req.body;
  if (!b || b.app !== 'flock.tt' || !b.config || typeof b.config !== 'object') return res.status(400).json({ error: 'That file is not a flock.tt backup' });
  const incoming = cleanConfig(b.config);
  delete incoming.signApiKey; delete incoming.username;
  if (incoming.obs) delete incoming.obs.password;
  config = { ...merge(config, incoming), signApiKey: config.signApiKey, username: config.username, obs: { ...merge(config.obs, incoming.obs || {}), password: config.obs?.password || '' } };
  saveConfig(config);
  io.emit('config', publicConfig());
  res.json(publicConfig());
});

// ---- Updates (desktop app only): the app's updater registers itself as globalThis.__flockUpdate ----
const updater = () => globalThis.__flockUpdate;
app.get('/api/update', (req, res) => res.json(updater()?.state() || { supported: false, status: 'idle', version: VERSION }));
app.post('/api/update', (req, res) => {
  const u = updater();
  if (!u?.state().supported) return res.status(400).json({ error: 'Updates install by themselves in the desktop app' });
  if (req.body?.action === 'install') u.install(); else u.check();
  res.json(u.state());
});

app.post('/api/connect', async (req, res) => {
  const username = (req.body?.username || config.username || '').trim();
  if (!username) return res.status(400).json({ error: 'Enter a TikTok username' });
  config.username = username.replace(/^@/, '');
  saveConfig(config);
  engine.resetStats();
  try {
    const state = await tiktok.connect(config.username, {
      signApiKey: config.signApiKey,
      autoReconnect: config.autoReconnect
    });
    res.json({ ok: true, roomId: state.roomId });
  } catch (err) {
    const msg = err?.message || String(err);
    const offline = /offline|not live|UserOffline/i.test(err?.name + msg);
    res.status(502).json({ error: offline ? `@${config.username} is not LIVE right now.` : msg });
  }
});

app.post('/api/disconnect', async (req, res) => {
  await tiktok.disconnect();
  res.json({ ok: true });
});

app.post('/api/simulate', (req, res) => {
  const evt = withGiftImage(simulate(req.body?.type, req.body || {}));
  if (!evt) return res.status(400).json({ error: 'Unknown event type' });
  if (evt.type === 'gift' && evt.gift.count > 1) {
    // Play it out like a real combo: x1, x2, x3 … then the final gift event.
    const total = evt.gift.count;
    for (let i = 1; i < total; i++) {
      setTimeout(() => handle({ ...evt, type: 'giftStreak', gift: { ...evt.gift, count: i, coins: evt.gift.diamonds * i } }), (i - 1) * 220);
    }
    setTimeout(() => handle(evt), (total - 1) * 220);
  } else {
    handle(evt);
  }
  res.json(evt);
});

app.post('/api/reset-stats', (req, res) => { engine.resetStats(); res.json({ ok: true }); });

app.post('/api/poll', (req, res) => {
  const { action, question, options, seconds } = req.body || {};
  const err = engine.pollAction(action, { question, options: Array.isArray(options) ? options : [], seconds });
  if (err) return res.status(400).json({ error: err });
  res.json(engine.pollState());
});
app.post('/api/queue', (req, res) => {
  const err = engine.queueAction(req.body?.action, { id: req.body?.id });
  if (err) return res.status(400).json({ error: err });
  res.json(engine.queue);
});
app.get('/api/record', (req, res) => res.json(engine.record));
app.post('/api/record', (req, res) => {
  const { action, wins, losses, draws } = req.body || {};
  if (!['win', 'loss', 'draw', 'undo', 'reset', 'set'].includes(action)) return res.status(400).json({ error: 'Unknown action' });
  engine.recordAction(action, { values: { wins, losses, draws } });
  res.json(engine.record);
});

// ---- Text-to-speech: test on stream, skip, clear ----
app.post('/api/tts/say', (req, res) => {
  const text = String(req.body?.text || '').trim().slice(0, 300);
  if (!text) return res.status(400).json({ error: 'Type something to say' });
  io.emit('tts', { text, kind: 'test' });
  res.json({ ok: true });
});
app.post('/api/tts/control', (req, res) => {
  const action = req.body?.action;
  if (!['skip', 'clear'].includes(action)) return res.status(400).json({ error: 'Unknown action' });
  io.emit('ttsControl', { action });
  res.json({ ok: true });
});

app.post('/api/test-alert', (req, res) => {
  const b = req.body || {};
  const str = (v, n) => (typeof v === 'string' || typeof v === 'number' ? String(v).slice(0, n) : '');
  const text = 'text' in b ? str(b.text, 300) : 'Test alert!';
  const image = str(b.image, 2000), sound = str(b.sound, 300), tts = str(b.tts, 300);
  const duration = Math.max(1, Math.min(60, Number(b.duration) || 4));
  if (text) io.emit('alert', { text, image, sound: sound.startsWith('/sounds/') ? sound : '', duration, user: b.user && typeof b.user === 'object' ? { nickname: str(b.user.nickname, 40), avatar: '' } : null });
  if (tts) io.emit('tts', { text: tts, kind: 'test' });
  res.json({ ok: true });
});

// Anything that goes wrong in a request answers with a short message, never a stack trace with file paths.
app.use('/api/', (req, res) => res.status(404).json({ error: 'Not found' }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) log(`Request failed: ${req.method} ${req.path}: ${err.message}`);
  res.status(status).json({ error: status === 400 ? 'That request was not valid' : status === 413 ? 'That is too big' : 'Something went wrong' });
});

/** Resolves once the server is listening; rejects (e.g. EADDRINUSE) if it can't start. Used by the desktop app. */
export const ready = new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(PORT, HOST, () => {
    log(`flock.tt running → http://localhost:${PORT}`);
    log('Open the dashboard in your browser, then add overlay links to TikTok LIVE Studio or OBS.');
    resolve({ port: PORT, host: HOST });
  });
});
ready.catch((err) => {
  if (process.versions.electron) return; // the desktop app shows its own message
  console.error(err.code === 'EADDRINUSE' ? `Port ${PORT} is already in use. Is flock.tt already running?` : err.message);
  process.exit(1);
});
export { PORT };
