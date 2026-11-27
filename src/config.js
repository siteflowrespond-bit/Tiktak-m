// flock.tt (c) 2026 siteflowrespond-bit. Owner proof sha256:99891628516a57a623400d9ccde22b170ecfac1527631e923149d480260a9270
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Where settings and uploaded sounds live. The desktop app points this at the user's app-data folder.
export const DATA_DIR = process.env.FLOCKTT_DATA_DIR || path.join(__dirname, '..', 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

export const DEFAULT_CONFIG = {
  username: '',
  signApiKey: '',
  autoReconnect: true,
  tts: {
    enabled: false,
    // 'all' reads every chat message, 'command' only messages starting with the prefix
    mode: 'command',
    prefix: '!tts',
    voice: '',
    rate: 1,
    pitch: 1,
    volume: 1,
    maxLength: 150,
    // who may use it: 'everyone' | 'followers' | 'subscribers' | 'gifters' | 'moderators' (moderators and you always can)
    who: 'everyone',
    readName: true, // "luna says hello" vs "hello"
    skipLinks: true,
    skipSpam: true, // collapses "aaaaaaa" and skips messages with no words in them
    blockedWords: '',
    userCooldown: 10, // seconds between messages from the same viewer
    maxQueue: 5, // chat messages waiting at once; more are dropped so it never falls behind
    alerts: true // also speak the "Say out loud" lines on alerts
  },
  goals: {
    likes: { enabled: true, label: 'Like goal', target: 10000, step: 0 }, // step: when reached, raise the target by this much (0 = stop)
    follows: { enabled: true, label: 'Follow goal', target: 100, step: 0 },
    coins: { enabled: true, label: 'Coin goal', target: 1000, step: 0 },
    shares: { enabled: false, label: 'Share goal', target: 50, step: 0 }
  },
  // Sound actions: play a sound when something happens (independent of alerts)
  sounds: {
    volume: 0.8,
    maxAtOnce: 4,
    hidden: [], // built-in sound files you deleted
    rules: [
      { id: 's-rose', enabled: true, trigger: { type: 'gift', giftName: 'Rose' }, sound: '/sounds/builtin/pop.wav', volume: 0.8, repeat: true, cooldown: 0 },
      { id: 's-mid', enabled: true, trigger: { type: 'gift', giftName: '', minCoins: 100, maxCoins: 999 }, sound: '/sounds/builtin/tada.wav', volume: 1, repeat: false, cooldown: 0 },
      { id: 's-big', enabled: true, trigger: { type: 'gift', giftName: '', minCoins: 1000 }, sound: '/sounds/builtin/airhorn.wav', volume: 1, repeat: false, cooldown: 0 },
      { id: 's-follow', enabled: true, trigger: { type: 'follow' }, sound: '/sounds/builtin/ding.wav', volume: 0.7, repeat: false, cooldown: 0 },
      { id: 's-share', enabled: true, trigger: { type: 'share' }, sound: '/sounds/builtin/whoosh.wav', volume: 0.7, repeat: false, cooldown: 0 },
      { id: 's-drum', enabled: true, trigger: { type: 'command', command: '!drum' }, sound: '/sounds/builtin/drumroll.wav', volume: 0.9, repeat: false, cooldown: 30 }
    ]
  },
  // OBS Studio remote control (OBS 28+ has the WebSocket server built in)
  obs: {
    url: 'ws://127.0.0.1:4455',
    password: '',
    autoConnect: false,
    // { id, enabled, name, trigger, action: { type: scene|show|hide|toggle|mute|unmute|togglemute, scene, source, input, seconds }, cooldown }
    rules: []
  },
  // Layouts: several overlays arranged on one canvas, shown through a single link (overlays/scene.html)
  layouts: [
    {
      id: 'main',
      name: 'My stream',
      width: 1080,
      height: 1920,
      widgets: [
        { id: 'w-celebrate', name: 'Celebrations', src: 'celebrate.html?min=100', x: 0, y: 0, w: 1080, h: 1920, hidden: false },
        { id: 'w-goal', name: 'Like goal', src: 'goal.html?goal=likes', x: 90, y: 240, w: 900, h: 110, hidden: false },
        { id: 'w-alerts', name: 'Alerts', src: 'alerts.html', x: 0, y: 470, w: 1080, h: 480, hidden: false },
        { id: 'w-combos', name: 'Gift combos', src: 'combos.html', x: 20, y: 960, w: 640, h: 320, hidden: false },
        { id: 'w-jar', name: 'Gift jar', src: 'jar.html?goal=1000', x: 700, y: 840, w: 360, h: 460, hidden: false }
      ]
    }
  ],
  polls: { enabled: true },
  queue: { command: '!join', max: 50 },
  // one message per line; several lines take turns every `every` seconds
  banner: { text: 'Welcome in! Follow for more', scroll: false, every: 8 },
  // wins & losses counter
  record: {
    auto: true, // count TikTok LIVE battles automatically
    chatCommands: true // you and your moderators can type !win !loss !draw !undo
  },
  // Subathon timer: events add time while it's running
  timer: {
    startMinutes: 60,
    perCoin: 6,
    perFollow: 30,
    perShare: 15,
    perSub: 300,
    per100Likes: 5
  },
  rules: [
    {
      id: 'follow-alert',
      enabled: true,
      name: 'Follow alert',
      trigger: { type: 'follow' },
      alert: { text: '{nickname} just followed!', image: '{avatar}', sound: '', duration: 4 },
      tts: '',
      cooldown: 0
    },
    {
      id: 'gift-alert',
      enabled: true,
      name: 'Small gift alert (1-99 coins)',
      trigger: { type: 'gift', giftName: '', minCoins: 1, maxCoins: 99 },
      alert: { text: '{nickname} sent {count}x {giftName}!', image: '{giftImage}', sound: '', duration: 5 },
      tts: '',
      cooldown: 0
    },
    {
      id: 'big-gift',
      enabled: true,
      name: 'Big gift (100+ coins)',
      trigger: { type: 'gift', giftName: '', minCoins: 100 },
      alert: { text: 'WOW! {nickname} sent {giftName} worth {coins} coins!', image: '{giftImage}', sound: '', duration: 7 },
      tts: 'Thank you {nickname} for the {giftName}!',
      cooldown: 0
    },
    {
      id: 'share-alert',
      enabled: true,
      name: 'Share alert',
      trigger: { type: 'share' },
      alert: { text: '{nickname} shared the LIVE!', image: '{avatar}', sound: '', duration: 3 },
      tts: '',
      cooldown: 0
    },
    {
      id: 'hello-command',
      enabled: true,
      name: '!hello command',
      trigger: { type: 'command', command: '!hello' },
      alert: { text: 'Hi {nickname}!', image: '{avatar}', sound: '', duration: 3 },
      tts: '',
      cooldown: 10
    }
  ]
};

export function merge(base, override) {
  if (Array.isArray(base)) return Array.isArray(override) ? override : base;
  if (base && typeof base === 'object') {
    const out = { ...base };
    for (const key of Object.keys(override || {})) {
      out[key] = key in base ? merge(base[key], override[key]) : override[key];
    }
    return out;
  }
  return override === undefined ? base : override;
}

/** Keeps only settings that have the right shape (numbers are numbers, lists are lists …), so a bad save
    can't break the app. Unknown top-level keys are dropped. */
function clean(base, v) {
  if (Array.isArray(base)) return Array.isArray(v) ? v.filter((x) => (x && typeof x === 'object' && !Array.isArray(x)) || typeof x === 'string') : undefined;
  if (base && typeof base === 'object') {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
    const out = {};
    for (const k of Object.keys(v)) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
      const c = k in base ? clean(base[k], v[k]) : v[k];
      if (c !== undefined) out[k] = c;
    }
    return out;
  }
  if (typeof base === 'number') { const n = typeof v === 'string' && v.trim() === '' ? NaN : Number(v); return typeof v !== 'boolean' && v !== null && Number.isFinite(n) ? n : undefined; }
  if (typeof base === 'boolean') return typeof v === 'boolean' ? v : undefined;
  if (typeof base === 'string') return typeof v === 'string' || typeof v === 'number' ? String(v) : undefined;
  return v;
}
const hasTrigger = (r) => r.trigger && typeof r.trigger === 'object' && typeof r.trigger.type === 'string';
export function cleanConfig(incoming) {
  const out = {};
  for (const k of Object.keys(incoming || {})) {
    if (!(k in DEFAULT_CONFIG)) continue;
    const c = clean(DEFAULT_CONFIG[k], incoming[k]);
    if (c !== undefined) out[k] = c;
  }
  if (out.rules) out.rules = out.rules.filter(hasTrigger);
  if (out.sounds?.rules) out.sounds.rules = out.sounds.rules.filter(hasTrigger);
  if (out.obs?.rules) out.obs.rules = out.obs.rules.filter((r) => hasTrigger(r) && r.action && typeof r.action === 'object');
  if (out.layouts) out.layouts = out.layouts.filter((l) => typeof l.id === 'string' && Array.isArray(l.widgets)).map((l) => ({ ...l, widgets: l.widgets.filter((w) => w && typeof w.src === 'string') }));
  if (out.goals) for (const [k, g] of Object.entries(out.goals)) if (!g || typeof g !== 'object' || Array.isArray(g)) delete out.goals[k];
  return out;
}

export function loadConfig() {
  // the saved file, else the copy kept from the save before (if the file got cut off, e.g. a power cut while saving)
  for (const file of [CONFIG_FILE, `${CONFIG_FILE}.bak`]) {
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (file !== CONFIG_FILE) {
        try { fs.copyFileSync(CONFIG_FILE, path.join(DATA_DIR, `config.broken-${Date.now()}.json`)); } catch { /* nothing to keep */ }
        try { fs.copyFileSync(file, CONFIG_FILE); } catch { /* read-only: still use it */ }
        console.log('Settings file was damaged; loaded the previous copy instead.');
      }
      return merge(DEFAULT_CONFIG, raw);
    } catch { /* missing or damaged: try the next */ }
  }
  return structuredClone(DEFAULT_CONFIG);
}

/** Writes a file so it's never left half-written: write a temp file, then swap it in. */
export function writeFileSafe(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

export function saveConfig(config) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  try { if (fs.existsSync(CONFIG_FILE)) fs.copyFileSync(CONFIG_FILE, `${CONFIG_FILE}.bak`); } catch { /* keep going */ }
  writeFileSafe(CONFIG_FILE, JSON.stringify(config, null, 2));
}
