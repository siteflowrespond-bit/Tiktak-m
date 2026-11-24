import { EventEmitter } from 'node:events';

/**
 * Keeps live stats and turns incoming events into overlay actions
 * (alerts and text-to-speech) according to the user's rules.
 */
export class Engine extends EventEmitter {
  constructor(getConfig) {
    super();
    this.getConfig = getConfig;
    this.lastFired = new Map();
    this.resetStats();
  }

  resetStats() {
    this.stats = {
      viewers: 0, likes: 0, coins: 0, follows: 0, shares: 0, comments: 0, gifts: 0, joins: 0,
      startedAt: Date.now()
    };
    this.gifters = new Map(); // user id -> { user, coins }
    this.emitStats();
  }

  topGifters(n = 10) {
    return [...this.gifters.values()].sort((a, b) => b.coins - a.coins).slice(0, n);
  }

  emitStats() {
    this.emit('stats', { ...this.stats, topGifters: this.topGifters() });
  }

  handle(evt) {
    const s = this.stats;
    switch (evt.type) {
      case 'chat': s.comments++; break;
      case 'gift': {
        s.gifts += evt.gift.count;
        s.coins += evt.gift.coins;
        const g = this.gifters.get(evt.user.id) || { user: evt.user, coins: 0 };
        g.coins += evt.gift.coins;
        g.user = evt.user;
        this.gifters.set(evt.user.id, g);
        break;
      }
      case 'like':
        s.likes = Math.max(s.likes + evt.likes, evt.totalLikes || 0);
        break;
      case 'follow': s.follows++; break;
      case 'share': s.shares++; break;
      case 'join': s.joins++; break;
      case 'viewers': s.viewers = evt.viewers; break;
    }
    // Don't flood clients with join/like/viewers spam in the event feed.
    if (evt.type !== 'viewers') this.emit('event', evt);
    if (evt.type !== 'giftStreak') this.emitStats();

    this.#runRules(evt);
    this.#chatTts(evt);
  }

  #runRules(evt) {
    const { rules } = this.getConfig();
    const now = Date.now();
    for (const rule of rules) {
      if (!rule.enabled || !matches(rule.trigger, evt)) continue;
      const cd = (Number(rule.cooldown) || 0) * 1000;
      if (cd && now - (this.lastFired.get(rule.id) || 0) < cd) continue;
      this.lastFired.set(rule.id, now);

      const vars = templateVars(evt);
      if (rule.alert?.text) {
        this.emit('alert', {
          rule: rule.id,
          text: fill(rule.alert.text, vars),
          image: fill(rule.alert.image || '', vars),
          sound: rule.alert.sound || '',
          duration: Number(rule.alert.duration) || 4
        });
      }
      if (rule.tts) this.emit('tts', { text: fill(rule.tts, vars) });
    }
  }

  #chatTts(evt) {
    const { tts } = this.getConfig();
    if (!tts.enabled || evt.type !== 'chat') return;
    let text = evt.comment.trim();
    if (tts.mode === 'command') {
      const prefix = tts.prefix.toLowerCase();
      if (!text.toLowerCase().startsWith(prefix)) return;
      text = text.slice(prefix.length).trim();
    }
    if (!text) return;
    text = text.slice(0, tts.maxLength);
    this.emit('tts', { text: `${evt.user.nickname} says ${text}` });
  }
}

export function matches(trigger, evt) {
  switch (trigger.type) {
    case 'gift': {
      if (evt.type !== 'gift') return false;
      const want = (trigger.giftName || '').trim().toLowerCase();
      if (want && evt.gift.name.toLowerCase() !== want) return false;
      const max = Number(trigger.maxCoins) || Infinity;
      return evt.gift.coins >= (Number(trigger.minCoins) || 0) && evt.gift.coins <= max;
    }
    case 'command': {
      if (evt.type !== 'chat') return false;
      const cmd = (trigger.command || '').trim().toLowerCase();
      if (!cmd) return false;
      const first = evt.comment.trim().toLowerCase().split(/\s+/)[0];
      return first === cmd;
    }
    case 'chat': {
      if (evt.type !== 'chat') return false;
      const kw = (trigger.keyword || '').trim().toLowerCase();
      return !kw || evt.comment.toLowerCase().includes(kw);
    }
    case 'like':
      return evt.type === 'like' && evt.likes >= (Number(trigger.minLikes) || 1);
    default:
      return evt.type === trigger.type; // follow, share, join, subscribe
  }
}

function templateVars(evt) {
  const u = evt.user || {};
  return {
    nickname: u.nickname || '',
    username: u.username || '',
    avatar: u.avatar || '',
    comment: evt.comment || '',
    giftName: evt.gift?.name || '',
    giftImage: evt.gift?.image || '',
    count: evt.gift?.count ?? '',
    coins: evt.gift?.coins ?? '',
    likes: evt.likes ?? ''
  };
}

function fill(tpl, vars) {
  return String(tpl).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}
