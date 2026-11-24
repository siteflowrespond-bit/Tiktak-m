import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import { loadConfig, saveConfig } from './config.js';
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
const io = new Server(server);

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const SOUND_DIRS = { builtin: path.join(PUBLIC_DIR, 'sounds', 'builtin'), custom: path.join(PUBLIC_DIR, 'sounds', 'custom') };
const AUDIO_EXT = /\.(mp3|wav|ogg|m4a|webm)$/i;
fs.mkdirSync(SOUND_DIRS.custom, { recursive: true });

app.use(express.json({ limit: '1mb' }));
app.use(express.static(PUBLIC_DIR));

const tiktok = new TikTokSource();
const engine = new Engine(() => config);

// ---- Wiring: TikTok -> engine -> all browser clients ----
tiktok.on('event', (evt) => engine.handle(evt));
tiktok.on('status', (s) => { io.emit('status', s); log(`status: ${s.status} ${s.detail || ''}`); });
tiktok.on('log', log);
engine.on('event', (evt) => io.emit('event', evt));
engine.on('stats', (stats) => io.emit('stats', stats));
engine.on('alert', (a) => io.emit('alert', a));
engine.on('tts', (t) => io.emit('tts', t));
engine.on('sound', (snd) => io.emit('sound', snd));
engine.on('timer', (t) => io.emit('timer', t));

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
  socket.emit('obsStatus', { status: obs.status, detail: obs.detail });
});

// ---- REST API used by the dashboard ----
app.get('/api/config', (req, res) => res.json(publicConfig()));

// Gift catalogue: the real room's gifts when connected, a sample list otherwise.
app.get('/api/gifts', (req, res) => res.json(tiktok.gifts?.length ? tiktok.gifts : SIM_GIFTS));

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
  const evt = simulate(req.body?.type, req.body || {});
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

app.post('/api/test-alert', (req, res) => {
  const { text = 'Test alert!', image = '', sound = '', duration = 4, tts = '' } = req.body || {};
  if (text) io.emit('alert', { text, image, sound, duration: Number(duration) || 4 });
  if (tts) io.emit('tts', { text: tts });
  res.json({ ok: true });
});

server.listen(PORT, HOST, () => {
  log(`flock.tt running → http://localhost:${PORT}`);
  log('Open the dashboard in your browser, then add overlay links to TikTok LIVE Studio or OBS.');
});
