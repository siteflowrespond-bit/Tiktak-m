import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import { loadConfig, saveConfig } from './config.js';
import { TikTokSource } from './tiktok.js';
import { Engine } from './engine.js';
import { simulate, SIM_GIFTS } from './simulate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 8787;
const HOST = process.env.HOST || '127.0.0.1';

let config = loadConfig();
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

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

function log(msg) {
  console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
}

function publicConfig() {
  // Never ship the API key to overlays.
  const { signApiKey, ...rest } = config;
  return { ...rest, hasSignApiKey: Boolean(signApiKey) };
}

io.on('connection', (socket) => {
  socket.emit('status', { status: tiktok.status, username: tiktok.username });
  socket.emit('config', publicConfig());
  socket.emit('stats', { ...engine.stats, topGifters: engine.topGifters() });
});

// ---- REST API used by the dashboard ----
app.get('/api/config', (req, res) => res.json({ ...publicConfig(), simGifts: SIM_GIFTS }));

app.put('/api/config', (req, res) => {
  const incoming = req.body || {};
  const signApiKey = incoming.signApiKey ? incoming.signApiKey : config.signApiKey;
  delete incoming.hasSignApiKey;
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
  engine.handle(evt);
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
  log(`Tiktak-m running → http://localhost:${PORT}`);
  log('Open the dashboard in your browser, then add overlay links to TikTok LIVE Studio or OBS.');
});
