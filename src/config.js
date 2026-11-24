import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
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
    maxLength: 150
  },
  goals: {
    likes: { enabled: true, label: 'Like goal', target: 10000 },
    follows: { enabled: true, label: 'Follow goal', target: 100 },
    coins: { enabled: true, label: 'Coin goal', target: 1000 },
    shares: { enabled: false, label: 'Share goal', target: 50 }
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
      alert: { text: 'Hi {nickname}! 👋', image: '{avatar}', sound: '', duration: 3 },
      tts: '',
      cooldown: 10
    }
  ]
};

function merge(base, override) {
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

export function loadConfig() {
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    return merge(DEFAULT_CONFIG, raw);
  } catch {
    return structuredClone(DEFAULT_CONFIG);
  }
}

export function saveConfig(config) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}
