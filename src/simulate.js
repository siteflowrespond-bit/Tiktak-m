// flock.tt (c) 2026 siteflowrespond-bit. Owner proof sha256:99891628516a57a623400d9ccde22b170ecfac1527631e923149d480260a9270
// Fake events so you can build and test overlays without being LIVE.
const NAMES = ['luna_star', 'gamer_max', 'pixelpanda', 'coffee.queen', 'noahbeats', 'mia.dance', 'tacotuesday', 'zoe_draws'];
const GIFTS = [
  { name: 'Rose', diamonds: 1 },
  { name: 'TikTok', diamonds: 1 },
  { name: 'Finger Heart', diamonds: 5 },
  { name: 'Doughnut', diamonds: 30 },
  { name: 'Hand Hearts', diamonds: 100 },
  { name: 'Galaxy', diamonds: 1000 },
  { name: 'Lion', diamonds: 29999 }
];
const COMMENTS = ['hello!!', 'love this stream', '!hello', '!tts this is a test', 'where are you from?', '🔥🔥🔥', 'lol', '😂😂😂', 'W stream 👏👏', '❤️❤️', 'no way 😱', '!red', '!blue', '💀💀', 'GG 🎉'];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function fakeUser(name) {
  const username = name ? String(name).toLowerCase().replace(/[^a-z0-9._]/g, '').slice(0, 24) || pick(NAMES) : pick(NAMES);
  return {
    id: username,
    username,
    nickname: name ? String(name).slice(0, 24) : username.replace(/[._]/g, ' '),
    avatar: ''
  };
}

export function simulate(type, opts = {}) {
  const user = fakeUser(opts.nickname);
  const ts = Date.now();
  switch (type) {
    case 'chat':
      return { type, user, comment: opts.comment || pick(COMMENTS), ts };
    case 'gift': {
      const g = opts.giftName ? (GIFTS.find((x) => x.name === opts.giftName) || GIFTS[0]) : pick(GIFTS);
      const count = g.diamonds < 10 ? 1 + Math.floor(Math.random() * 10) : 1;
      return { type, user, gift: { id: 0, name: g.name, image: '', diamonds: g.diamonds, count, coins: g.diamonds * count }, ts };
    }
    case 'like':
      return { type, user, likes: 1 + Math.floor(Math.random() * 15), totalLikes: 0, ts };
    case 'battle': {
      const result = ['win', 'loss', 'draw'].includes(opts.result) ? opts.result : pick(['win', 'win', 'loss', 'draw']);
      return { type, result, opponent: fakeUser().nickname, battleId: `sim-${ts}`, ts };
    }
    case 'viewers':
      return { type, viewers: 10 + Math.floor(Math.random() * 500), ts };
    case 'follow':
    case 'share':
    case 'join':
    case 'subscribe':
      return { type, user, ts };
    default:
      return null;
  }
}

export const SIM_GIFTS = GIFTS.map((g) => ({ name: g.name, diamonds: g.diamonds, image: '' }));
