// flock.tt (c) 2026 siteflowrespond-bit. Owner proof sha256:99891628516a57a623400d9ccde22b170ecfac1527631e923149d480260a9270
// The public streamer list (see registry/). Only runs if the streamer said yes (config.listMe === true).
// It sends ONLY: the TikTok @username you connected to (public while you're live), the flock.tt version and
// your platform, plus a random key for this install so only you can take yourself off the list.
// Never your API key, OBS password, viewers, chat, gifts or anything else.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// The list server (see registry/README.md). Empty = the feature is off for everyone: the app never asks and
// never sends anything. Put the address here once the list server is online, e.g. 'https://flocktt-list.onrender.com'.
// For testing, the FLOCKTT_LIST_URL environment variable overrides it.
const DEFAULT_LIST_URL = '';
export const LIST_URL = (process.env.FLOCKTT_LIST_URL || DEFAULT_LIST_URL).replace(/\/+$/, '');

const EVERY = 4 * 60_000; // check in every 4 minutes while connected

export function startStreamerList({ tiktok, getConfig, dataDir, version, log = () => {} }) {
  if (!LIST_URL || !/^https?:\/\//.test(LIST_URL)) return { enabled: false, url: '', forget: async () => {} };
  const platform = { win32: 'win', darwin: 'mac', linux: 'linux' }[process.platform] || process.platform;

  // a random key for this copy of flock.tt (kept next to the settings, never shown)
  const keyFile = path.join(dataDir, 'install-key');
  let key = '';
  try { key = fs.readFileSync(keyFile, 'utf8').trim(); } catch { /* first run */ }
  if (key.length < 32) { key = crypto.randomBytes(24).toString('hex'); try { fs.writeFileSync(keyFile, key); } catch { /* read-only: use it for this run */ } }

  const post = async (route, body) => {
    try {
      const r = await fetch(`${LIST_URL}${route}`, { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': `flock.tt/${version}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
      return r.ok;
    } catch { return false; } // the list being down must never affect the stream
  };
  let timer = 0;
  const beat = () => {
    const c = getConfig();
    if (c.listMe !== true || tiktok.status !== 'connected' || !tiktok.username) return;
    post('/api/heartbeat', { username: tiktok.username, version, platform, key });
  };
  tiktok.on('status', (s) => {
    clearInterval(timer);
    if (s.status === 'connected') { beat(); timer = setInterval(beat, EVERY); timer.unref?.(); }
  });
  // "take me off" must get through: if the list can't be reached, try again on the next start
  const pendingFile = path.join(dataDir, 'list-forget.json');
  const forget = async (username) => {
    if (!username) return false;
    const ok = await post('/api/forget', { username, key });
    try {
      if (ok) fs.rmSync(pendingFile, { force: true });
      else fs.writeFileSync(pendingFile, JSON.stringify({ username }));
    } catch { /* nothing more we can do */ }
    log(ok ? `Took @${username} off the streamer list` : `Could not reach the streamer list; will remove @${username} next time flock.tt starts`);
    return ok;
  };
  try { const p = JSON.parse(fs.readFileSync(pendingFile, 'utf8')); if (p?.username && getConfig().listMe !== true) forget(p.username); } catch { /* nothing pending */ }
  return {
    enabled: true,
    url: LIST_URL,
    /** Takes this streamer off the list (when they switch it off). */
    forget,
    /** Sends a check-in now (when they switch it on while live). */
    beatNow: beat
  };
}
