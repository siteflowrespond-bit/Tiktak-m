// flock.tt (c) 2026 siteflowrespond-bit. Owner proof sha256:99891628516a57a623400d9ccde22b170ecfac1527631e923149d480260a9270
import { EventEmitter } from 'node:events';
import { TikTokLiveConnection, WebcastEvent, ControlEvent } from 'tiktok-live-connector';

/** Picks the first URL out of TikTok's various image shapes. */
function imageUrl(img) {
  if (!img) return '';
  if (typeof img === 'string') return img;
  const list = img.url || img.urlList || img.urls || img.url_list;
  if (Array.isArray(list) && list.length) return list[0];
  return '';
}

function normUser(u = {}) {
  return {
    id: String(u.userId ?? u.uniqueId ?? ''),
    username: u.uniqueId || '',
    nickname: u.nickname || u.uniqueId || 'Someone',
    avatar: imageUrl(u.profilePicture || u.avatarThumb)
  };
}

/**
 * Wraps a TikTok LIVE connection and re-emits a small, normalized event shape:
 *   { type, user, ...fields, ts }
 * Types: chat, gift, like, follow, share, join, subscribe, viewers, streamEnd
 */
export class TikTokSource extends EventEmitter {
  constructor() {
    super();
    this.conn = null;
    this.username = '';
    this.status = 'disconnected';
    this.manualDisconnect = false;
    this.reconnectTimer = null;
    this.gifts = [];
  }

  setStatus(status, detail = '') {
    this.status = status;
    this.emit('status', { status, username: this.username, detail });
  }

  async connect(username, { signApiKey, autoReconnect } = {}) {
    await this.disconnect();
    this.username = username.replace(/^@/, '').trim();
    this.autoReconnect = autoReconnect;
    this.manualDisconnect = false;
    this.signApiKey = signApiKey;
    return this.#open();
  }

  async #open() {
    const options = { enableExtendedGiftInfo: true };
    if (this.signApiKey) options.signApiKey = this.signApiKey;
    const conn = new TikTokLiveConnection(this.username, options);
    this.conn = conn;
    this.#wire(conn);
    this.setStatus('connecting');
    try {
      const state = await conn.connect();
      this.gifts = parseGiftList(conn.availableGifts);
      this.setStatus('connected', `room ${state.roomId}`);
      return state;
    } catch (err) {
      const msg = err?.message || String(err);
      this.setStatus('error', msg);
      this.#scheduleReconnect();
      throw err;
    }
  }

  #scheduleReconnect() {
    if (!this.autoReconnect || this.manualDisconnect || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.manualDisconnect) this.#open().catch(() => {});
    }, 30_000);
    this.emit('status', { status: this.status, username: this.username, detail: 'retrying in 30s' });
  }

  async disconnect() {
    this.manualDisconnect = true;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.conn) {
      const c = this.conn;
      this.conn = null;
      c.removeAllListeners();
      try { await c.disconnect(); } catch { /* ignore */ }
    }
    this.setStatus('disconnected');
  }

  #wire(conn) {
    const out = (evt) => this.emit('event', { ...evt, ts: Date.now() });

    conn.on(ControlEvent.DISCONNECTED, () => {
      if (this.conn !== conn) return;
      this.setStatus('disconnected', 'connection closed');
      this.#scheduleReconnect();
    });
    conn.on(ControlEvent.ERROR, (e) => {
      this.emit('log', `TikTok error: ${e?.info || ''} ${e?.exception?.message || ''}`);
    });

    conn.on(WebcastEvent.CHAT, (d) => out({ type: 'chat', user: normUser(d.user), comment: d.comment || '' }));

    conn.on(WebcastEvent.GIFT, (d) => {
      const details = d.giftDetails || {};
      const ext = d.extendedGiftInfo || {};
      const streakable = details.giftType === 1;
      // For streakable gifts, only count the event that closes the streak.
      if (streakable && !d.repeatEnd) {
        out({ type: 'giftStreak', user: normUser(d.user), gift: giftInfo(d, details, ext) });
        return;
      }
      out({ type: 'gift', user: normUser(d.user), gift: giftInfo(d, details, ext) });
    });

    conn.on(WebcastEvent.LIKE, (d) => out({
      type: 'like', user: normUser(d.user), likes: d.likeCount || 1, totalLikes: d.totalLikeCount || 0
    }));
    conn.on(WebcastEvent.FOLLOW, (d) => out({ type: 'follow', user: normUser(d.user) }));
    conn.on(WebcastEvent.SHARE, (d) => out({ type: 'share', user: normUser(d.user) }));
    conn.on(WebcastEvent.MEMBER, (d) => out({ type: 'join', user: normUser(d.user) }));
    conn.on(WebcastEvent.SUPER_FAN ?? 'superFan', (d) => out({ type: 'subscribe', user: normUser(d.user) }));
    conn.on(WebcastEvent.ROOM_USER, (d) => out({ type: 'viewers', viewers: d.viewerCount || 0 }));
    conn.on(WebcastEvent.STREAM_END, () => {
      out({ type: 'streamEnd' });
      this.manualDisconnect = true; // stream is over; don't hammer reconnects
    });
  }
}

/** Turns the room's gift catalogue into [{ name, diamonds, image }], whatever shape it arrives in. */
function parseGiftList(raw) {
  const list = Array.isArray(raw) ? raw : raw?.gifts || raw?.giftList || raw?.data?.gifts || [];
  const seen = new Set();
  return list
    .map((g) => ({
      name: g.name || g.giftName || '',
      diamonds: Number(g.diamond_count ?? g.diamondCount ?? 0),
      image: imageUrl(g.image || g.giftImage || g.icon)
    }))
    .filter((g) => g.name && !seen.has(g.name) && seen.add(g.name))
    .sort((a, b) => a.diamonds - b.diamonds);
}

function giftInfo(d, details, ext) {
  const diamonds = details.diamondCount ?? ext.diamond_count ?? 0;
  const count = d.repeatCount || 1;
  return {
    id: d.giftId,
    name: details.giftName || ext.name || `Gift #${d.giftId}`,
    image: imageUrl(details.giftImage) || imageUrl(ext.image),
    diamonds,
    count,
    coins: diamonds * count
  };
}
