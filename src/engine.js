// flock.tt (c) 2026 siteflowrespond-bit. Owner proof sha256:99891628516a57a623400d9ccde22b170ecfac1527631e923149d480260a9270
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
    this.record = { wins: 0, losses: 0, draws: 0, streak: 0, last: null };
    this.recordHistory = [];
    this.resetStats();
  }

  // ───── wins & losses ─────
  /** action: 'win' | 'loss' | 'draw' | 'undo' | 'reset' | 'set'. Returns false if nothing changed. */
  recordAction(action, { opponent = '', source = 'manual', values } = {}) {
    const r = this.record;
    if (action === 'undo') {
      const prev = this.recordHistory.pop();
      if (!prev) return false;
      this.record = prev;
    } else if (action === 'reset' || action === 'set') {
      this.recordHistory.push({ ...r });
      const v = action === 'set' ? values || {} : {};
      const n = (x) => Math.max(0, Math.min(1e6, Math.floor(Number(x) || 0)));
      this.record = { wins: n(v.wins), losses: n(v.losses), draws: n(v.draws), streak: 0, last: null };
    } else if (['win', 'loss', 'draw'].includes(action)) {
      this.recordHistory.push({ ...r });
      const next = { ...r, last: { result: action, opponent, source, at: Date.now() } };
      if (action === 'win') { next.wins++; next.streak = r.streak > 0 ? r.streak + 1 : 1; }
      if (action === 'loss') { next.losses++; next.streak = r.streak < 0 ? r.streak - 1 : -1; }
      if (action === 'draw') { next.draws++; next.streak = 0; }
      this.record = next;
    } else return false;
    if (this.recordHistory.length > 50) this.recordHistory.shift();
    this.emit('record', this.record);
    return true;
  }

  #recordFromEvent(evt) {
    const cfg = this.getConfig().record || {};
    if (evt.type === 'battle' && cfg.auto !== false) this.recordAction(evt.result, { opponent: evt.opponent, source: 'battle' });
    if (evt.type === 'chat' && cfg.chatCommands !== false && (evt.user?.isHost || evt.user?.isModerator)) {
      const m = /^!(win|won|loss|lose|lost|draw|tie|undo)\b/i.exec(String(evt.comment || '').trim());
      if (m) this.recordAction({ won: 'win', lose: 'loss', lost: 'loss', tie: 'draw' }[m[1].toLowerCase()] || m[1].toLowerCase(), { source: 'chat' });
    }
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
    this.#recordFromEvent(evt);
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
      if (rule.tts && this.getConfig().tts?.alerts !== false) this.emit('tts', { text: fill(rule.tts, vars), kind: 'alert' });
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
    const why = ttsBlocked(tts, evt, this.gifters, this.ttsLast || (this.ttsLast = new Map()));
    if (why) { this.emit('ttsSkipped', { user: evt.user?.nickname, why }); return; }
    const text = ttsText(tts, evt);
    if (text) this.emit('tts', { text, kind: 'chat' });
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

// ───── chat text-to-speech rules ─────
const LINK = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|xyz|io|gg|ly|tv|me|co|app|link|shop|live)\b)/i;

/** Why a chat message shouldn't be read out, or '' if it should. */
export function ttsBlocked(tts, evt, gifters, lastByUser, now = Date.now()) {
  const u = evt.user || {};
  const raw = String(evt.comment || '').trim();
  if (tts.mode === 'command' && !raw.toLowerCase().startsWith(String(tts.prefix || '!tts').toLowerCase())) return 'no command';
  const boss = u.isHost || u.isModerator;
  if (!boss) {
    const who = tts.who || 'everyone';
    if (who === 'followers' && !(u.isFollower || u.isSubscriber)) return 'not a follower';
    if (who === 'subscribers' && !u.isSubscriber) return 'not a subscriber';
    if (who === 'gifters' && !(u.isGifter || gifters?.has(u.id))) return 'has not sent a gift';
    if (who === 'moderators') return 'not a moderator';
  }
  if (tts.skipLinks && LINK.test(raw)) return 'link';
  const words = String(tts.blockedWords || '').split(/[,\n]/).map((w) => w.trim().toLowerCase()).filter(Boolean);
  if (words.length && words.some((w) => raw.toLowerCase().includes(w))) return 'blocked word';
  // spam: once repeated letters are squashed ("aaaaa" -> "a"), there must be a real word left
  if (tts.skipSpam && !/\p{L}{2,}/u.test(raw.replace(/^!\S+/, '').replace(/(.)\1{2,}/gu, '$1'))) return 'no words';
  const cd = (Number(tts.userCooldown) || 0) * 1000;
  if (cd && !boss) {
    const key = u.id || u.username || u.nickname;
    if (now - (lastByUser.get(key) || 0) < cd) return 'cooldown';
    lastByUser.set(key, now);
  }
  return '';
}

/** The words to speak for a chat message. */
export function ttsText(tts, evt) {
  let text = String(evt.comment || '').trim();
  if (tts.mode === 'command') text = text.slice(String(tts.prefix || '!tts').length).trim();
  if (tts.skipSpam) text = text.replace(/(.)\1{3,}/gu, '$1$1$1').replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, '').replace(/\s+/g, ' ').trim();
  const max = Number(tts.maxLength) || 150;
  if (text.length > max) { text = text.slice(0, max); const sp = text.lastIndexOf(' '); if (sp > max * 0.6) text = text.slice(0, sp); }
  if (!text) return '';
  return tts.readName !== false ? `${evt.user?.nickname || 'Someone'} says ${text}` : text;
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
