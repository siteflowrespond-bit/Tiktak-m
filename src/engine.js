import { EventEmitter } from 'node:events';

/**
 * Keeps live stats and turns incoming events into overlay actions:
 * alerts, text-to-speech, sounds and subathon timer changes.
 */
export class Engine extends EventEmitter {
  constructor(getConfig) {
    super();
    this.getConfig = getConfig;
    this.lastFired = new Map();
    this.timer = { running: false, endsAt: 0, remaining: getConfig().timer.startMinutes * 60_000 };
    this.likeRemainder = 0;
    this.resetStats();
  }

  // ───── stats ─────
  resetStats() {
    this.stats = {
      viewers: 0, likes: 0, coins: 0, follows: 0, shares: 0, comments: 0, gifts: 0, joins: 0, subs: 0,
      startedAt: Date.now(),
      topGift: null, // biggest single gift (by coins, combo included)
      topStreak: null // longest combo (by count)
    };
    this.gifters = new Map(); // user id -> { user, coins }
    this.likers = new Map(); // user id -> { user, likes }
    this.emitStats();
  }

  top(map, key, n = 10) {
    return [...map.values()].sort((a, b) => b[key] - a[key]).slice(0, n);
  }

  snapshot() {
    return { ...this.stats, topGifters: this.top(this.gifters, 'coins'), topLikers: this.top(this.likers, 'likes') };
  }

  emitStats() {
    this.emit('stats', this.snapshot());
  }

  handle(evt) {
    const s = this.stats;
    switch (evt.type) {
      case 'chat': s.comments++; break;
      case 'gift': {
        s.gifts += evt.gift.count;
        s.coins += evt.gift.coins;
        bump(this.gifters, evt.user, 'coins', evt.gift.coins);
        if (!s.topGift || evt.gift.coins > s.topGift.gift.coins) s.topGift = { user: evt.user, gift: evt.gift, ts: evt.ts };
        if (evt.gift.count > 1 && (!s.topStreak || evt.gift.count > s.topStreak.gift.count)) s.topStreak = { user: evt.user, gift: evt.gift, ts: evt.ts };
        this.addTime(evt.gift.coins * this.getConfig().timer.perCoin);
        break;
      }
      case 'like':
        s.likes = Math.max(s.likes + evt.likes, evt.totalLikes || 0);
        bump(this.likers, evt.user, 'likes', evt.likes);
        this.likeRemainder += evt.likes;
        if (this.likeRemainder >= 100) {
          const hundreds = Math.floor(this.likeRemainder / 100);
          this.likeRemainder -= hundreds * 100;
          this.addTime(hundreds * this.getConfig().timer.per100Likes);
        }
        break;
      case 'follow': s.follows++; this.addTime(this.getConfig().timer.perFollow); break;
      case 'share': s.shares++; this.addTime(this.getConfig().timer.perShare); break;
      case 'subscribe': s.subs++; this.addTime(this.getConfig().timer.perSub); break;
      case 'join': s.joins++; break;
      case 'viewers': s.viewers = evt.viewers; break;
    }
    if (evt.type !== 'viewers') this.emit('event', evt);
    if (evt.type !== 'giftStreak') this.emitStats();

    if (evt.type === 'giftStreak') return; // actions run once, when the combo ends
    this.#runAlertRules(evt);
    this.#runSoundRules(evt);
    this.#runObsRules(evt);
    this.#chatTts(evt);
  }

  #cooldownOk(id, seconds) {
    const cd = (Number(seconds) || 0) * 1000;
    const now = Date.now();
    if (cd && now - (this.lastFired.get(id) || 0) < cd) return false;
    this.lastFired.set(id, now);
    return true;
  }

  #runAlertRules(evt) {
    for (const rule of this.getConfig().rules) {
      if (!rule.enabled || !matches(rule.trigger, evt) || !this.#cooldownOk(rule.id, rule.cooldown)) continue;
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

  #runSoundRules(evt) {
    const { sounds } = this.getConfig();
    for (const rule of sounds.rules) {
      if (!rule.enabled || !rule.sound || !matches(rule.trigger, evt) || !this.#cooldownOk(rule.id, rule.cooldown)) continue;
      const times = rule.repeat && evt.gift ? Math.min(evt.gift.count, 10) : 1;
      this.emit('sound', { src: rule.sound, volume: (Number(rule.volume) || 1) * sounds.volume, times });
    }
  }

  #runObsRules(evt) {
    const rules = this.getConfig().obs?.rules || [];
    for (const rule of rules) {
      if (!rule.enabled || !rule.action?.type || !matches(rule.trigger, evt) || !this.#cooldownOk(rule.id, rule.cooldown)) continue;
      this.emit('obs', { action: rule.action, why: `${rule.name || 'OBS action'}: ${evt.user?.nickname || evt.type}` });
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
    this.emit('tts', { text: `${evt.user.nickname} says ${text.slice(0, tts.maxLength)}` });
  }

  // ───── subathon timer ─────
  timerState() {
    const remaining = this.timer.running ? Math.max(0, this.timer.endsAt - Date.now()) : this.timer.remaining;
    return { running: this.timer.running, remaining, endsAt: this.timer.running ? this.timer.endsAt : 0 };
  }

  timerAction(action, seconds = 0) {
    const t = this.timer;
    const now = Date.now();
    switch (action) {
      case 'reset':
        t.running = false;
        t.remaining = this.getConfig().timer.startMinutes * 60_000;
        break;
      case 'start':
        if (!t.running) {
          if (!t.remaining) t.remaining = this.getConfig().timer.startMinutes * 60_000;
          t.endsAt = now + t.remaining;
          t.running = true;
        }
        break;
      case 'pause':
        if (t.running) { t.remaining = Math.max(0, t.endsAt - now); t.running = false; }
        break;
      case 'add':
        this.addTime(Number(seconds) || 0, true);
        return;
    }
    this.emit('timer', this.timerState());
  }

  addTime(seconds, evenIfPaused = false) {
    if (!seconds) return;
    const t = this.timer;
    if (t.running) {
      t.endsAt = Math.max(Date.now(), t.endsAt + seconds * 1000);
    } else if (evenIfPaused) {
      t.remaining = Math.max(0, t.remaining + seconds * 1000);
    } else {
      return;
    }
    this.emit('timer', { ...this.timerState(), added: seconds });
  }
}

function bump(map, user, key, amount) {
  const row = map.get(user.id) || { user, [key]: 0 };
  row[key] += amount;
  row.user = user;
  map.set(user.id, row);
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
      return evt.comment.trim().toLowerCase().split(/\s+/)[0] === cmd;
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
