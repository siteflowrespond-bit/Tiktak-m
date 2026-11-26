// flock.tt (c) 2026 siteflowrespond-bit. Owner proof sha256:99891628516a57a623400d9ccde22b170ecfac1527631e923149d480260a9270
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import { loadConfig, saveConfig, DATA_DIR } from './config.js';
import { TikTokSource } from './tiktok.js';
import { Engine } from './engine.js';
import { ObsLink } from './obs.js';
import { simulate, SIM_GIFTS } from './simulate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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
  try { fs.writeFileSync(GIFT_FILE, JSON.stringify(giftCatalog)); } catch (e) { log(`Could not save gift pictures: ${e.message}`); }
}
/** Gives a gift event a picture: its own, else the saved one for that gift, else a plain gift-box icon. */
function withGiftImage(evt) {
  if (!evt?.gift || evt.gift.image) return evt;
  const key = String(evt.gift.name).toLowerCase();
  const art = GIFT_ART[key] && `/overlays/gifts/${GIFT_ART[key]}.svg`;
  return { ...evt, gift: { ...evt.gift, image: giftImageByName.get(key) || art || GIFT_FALLBACK } };
}

tiktok.on('event', (evt) => engine.handle(withGiftImage(evt)));
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
engine.on('queue', (q) => io.emit('queue', q));

// ---- Wins & losses: kept on disk so the record carries over between streams ----
const RECORD_FILE = path.join(DATA_DIR, 'record.json');
try { const r = JSON.parse(fs.readFileSync(RECORD_FILE, 'utf8')); engine.record = { wins: 0, losses: 0, draws: 0, streak: 0, last: null, ...r }; } catch { /* first run */ }
engine.on('record', (r) => {
  io.emit('record', r);
  try { fs.writeFileSync(RECORD_FILE, JSON.stringify(r)); } catch (e) { log(`Could not save wins & losses: ${e.message}`); }
  if (r.last && Date.now() - r.last.at < 2000) log(`Record: ${r.last.result}${r.last.opponent ? ` vs ${r.last.opponent}` : ''} (${r.wins}W ${r.losses}L ${r.draws}D)`);
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
  return { ...rest, obs: obsRest, hasSignApiKey: Boolean(signApiKey), hasObsPassword: Boolean(password) };
}

io.on('connection', (socket) => {
  socket.emit('status', { status: tiktok.status, username: tiktok.username });
  socket.emit('config', publicConfig());
  socket.emit('stats', engine.snapshot());
  socket.emit('timer', engine.timerState());
  socket.emit('record', engine.record);
  socket.emit('poll', engine.pollState());
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
  fs.writeFileSync(path.join(SOUND_DIRS.custom, safe), req.body);
  res.json({ kind: 'custom', name: safe.replace(AUDIO_EXT, ''), src: `/sounds/custom/${encodeURIComponent(safe)}` });
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
  if (!src) return res.status(400).json({ error: 'No sound' });
  io.emit('sound', { src, volume: Number(volume) * config.sounds.volume, times: 1 });
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
  engine.timerAction(action, seconds);
  res.json(engine.timerState());
});

app.put('/api/config', (req, res) => {
  const incoming = req.body || {};
  const signApiKey = incoming.signApiKey ? incoming.signApiKey : config.signApiKey;
  delete incoming.hasSignApiKey;
  delete incoming.hasObsPassword;
  if (incoming.obs) incoming.obs = { ...config.obs, ...incoming.obs, password: incoming.obs.password || config.obs?.password || '' };
  config = { ...config, ...incoming, signApiKey };
  saveConfig(config);
  io.emit('config', publicConfig());
  res.json(publicConfig());
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
      setTimeout(() => engine.handle({ ...evt, type: 'giftStreak', gift: { ...evt.gift, count: i, coins: evt.gift.diamonds * i } }), (i - 1) * 220);
    }
    setTimeout(() => engine.handle(evt), (total - 1) * 220);
  } else {
    engine.handle(evt);
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
  const { text = 'Test alert!', image = '', sound = '', duration = 4, tts = '' } = req.body || {};
  if (text) io.emit('alert', { text, image, sound, duration: Number(duration) || 4 });
  if (tts) io.emit('tts', { text: tts });
  res.json({ ok: true });
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
