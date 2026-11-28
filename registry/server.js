// flock.tt (c) 2026 siteflowrespond-bit. Owner proof sha256:99891628516a57a623400d9ccde22b170ecfac1527631e923149d480260a9270
// flock.tt streamer list: a tiny server that records which TikTok accounts flock.tt connects to,
// and shows them on a public page (or an owner-only page, with PUBLIC=0).
//
// What it stores, per streamer: their TikTok @username (already public while they're live), the flock.tt
// version and platform, and when they were first and last seen. Nothing else: no viewers, no chat, no keys.
//
// No dependencies. Run:  OWNER_TOKEN=pick-a-long-password node registry/server.js
// Settings (environment variables):
//   PORT         port to listen on (default 8790; hosts usually set this for you)
//   OWNER_TOKEN  your password for the owner page (/admin) and for removing entries. Required.
//   PUBLIC       1 (default) = anyone can see the list at / ; 0 = only you, after logging in
//   DATA_FILE    where the list is saved (default ./registry-data.json)
//   LIVE_MINUTES how recently a streamer must have checked in to count as "live now" (default 10)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const PORT = Number(process.env.PORT) || 8790;
const OWNER_TOKEN = process.env.OWNER_TOKEN || '';
const PUBLIC = process.env.PUBLIC !== '0';
const DATA_FILE = path.resolve(process.env.DATA_FILE || 'registry-data.json');
const LIVE_MS = (Number(process.env.LIVE_MINUTES) || 10) * 60_000;

if (OWNER_TOKEN.length < 12) {
  console.error('Set OWNER_TOKEN to a password of at least 12 characters, e.g.  OWNER_TOKEN=correct-horse-battery-staple node registry/server.js');
  process.exit(1);
}

// ── storage: one JSON file, written safely ──
/** @type {Map<string, {username:string, version:string, platform:string, firstSeen:number, lastSeen:number, sessions:number, key:string}>} */
const streamers = new Map();
try {
  for (const s of JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))) if (s?.username) streamers.set(s.username.toLowerCase(), s);
  console.log(`Loaded ${streamers.size} streamers from ${DATA_FILE}`);
} catch { console.log(`Starting a new list at ${DATA_FILE}`); }
let dirty = false;
function save() {
  if (!dirty) return;
  dirty = false;
  const tmp = `${DATA_FILE}.tmp`;
  try { fs.writeFileSync(tmp, JSON.stringify([...streamers.values()])); fs.renameSync(tmp, DATA_FILE); } catch (e) { dirty = true; console.error('Could not save:', e.message); }
}
setInterval(save, 5000).unref();
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { save(); process.exit(0); });

// ── helpers ──
const USERNAME = /^[a-zA-Z0-9._]{2,24}$/; // TikTok's own rule for usernames
const hash = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const clean = (v, n) => String(v ?? '').replace(/[^\w.\- ]/g, '').slice(0, n);
const ipOf = (req) => String(req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

function send(res, status, body, type = 'application/json; charset=utf-8', extra = {}) {
  res.writeHead(status, {
    'Content-Type': type,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'self'; base-uri 'none'",
    'Cache-Control': 'no-store',
    ...extra
  });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}
/** The owner logs in with the browser's own password box (user: owner, password: OWNER_TOKEN). */
function isOwner(req) {
  const m = /^Basic (.+)$/.exec(req.headers.authorization || '');
  if (m) { const [, pass = ''] = Buffer.from(m[1], 'base64').toString().split(/:(.*)/s); if (same(pass, OWNER_TOKEN)) return true; }
  const b = /^Bearer (.+)$/.exec(req.headers.authorization || '');
  return Boolean(b && same(b[1], OWNER_TOKEN));
}
const askLogin = (res) => send(res, 401, 'Owner login needed', 'text/plain; charset=utf-8', { 'WWW-Authenticate': 'Basic realm="flock.tt owner", charset="UTF-8"' });

async function readJson(req, limit = 2048) {
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > limit) throw Object.assign(new Error('Too big'), { status: 413 }); chunks.push(c); }
  try { return JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch { throw Object.assign(new Error('Bad JSON'), { status: 400 }); }
}

// a flood of requests from one place gets slowed down
const hits = new Map();
setInterval(() => hits.clear(), 60_000).unref();
const tooMany = (req, max) => { const k = ipOf(req); const n = (hits.get(k) || 0) + 1; hits.set(k, n); return n > max; };

function list() {
  const now = Date.now();
  return [...streamers.values()]
    .map(({ key, ...s }) => ({ ...s, live: now - s.lastSeen < LIVE_MS }))
    .sort((a, b) => (b.live - a.live) || (b.lastSeen - a.lastSeen));
}

// ── pages ──
function ago(t) {
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60); if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60); if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}
function page({ owner }) {
  const rows = list();
  const live = rows.filter((r) => r.live).length;
  const row = (r) => `<tr><td><span class="dot${r.live ? ' on' : ''}"></span><a href="https://www.tiktok.com/@${esc(r.username)}/live" rel="noopener noreferrer" target="_blank">@${esc(r.username)}</a></td>
    <td>${r.live ? '<b>Live now</b>' : esc(ago(r.lastSeen))}</td><td class="m">v${esc(r.version || '?')}</td><td class="m">${esc(r.platform || '')}</td><td class="m">${r.sessions}</td>
    ${owner ? `<td><form method="post" action="/admin/remove"><input type="hidden" name="u" value="${esc(r.username)}"><button title="Remove from the list">Remove</button></form></td>` : ''}</tr>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="60"><title>${owner ? 'Owner · ' : ''}Streamers on flock.tt</title><meta name="robots" content="noindex">
<style>
:root{color-scheme:dark}body{margin:0;background:#08080a;color:#f4f4f5;font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:900px;margin:0 auto;padding:32px 16px 60px}h1{font-size:28px;letter-spacing:-.03em;margin:0 0 4px}
p{color:#a1a1aa;margin:0 0 20px}.cards{display:flex;gap:12px;flex-wrap:wrap;margin:0 0 20px}.card{flex:1;min-width:150px;padding:14px 16px;border:1px solid #ffffff14;border-radius:14px;background:#111114}
.card b{display:block;font-size:30px;letter-spacing:-.04em}.card span{color:#a1a1aa;font-size:12px;text-transform:uppercase;letter-spacing:.08em}
.wrap{overflow-x:auto;border:1px solid #ffffff14;border-radius:14px;background:#111114}table{width:100%;border-collapse:collapse;min-width:560px}
th,td{text-align:left;padding:10px 14px;border-bottom:1px solid #ffffff0d;white-space:nowrap}th{color:#6b6b76;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.06em}
tr:last-child td{border-bottom:0}a{color:#fff;text-decoration:none;font-weight:600}a:hover{text-decoration:underline}.m{color:#a1a1aa}
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#3a3a42;margin-right:10px;vertical-align:1px}.dot.on{background:#ff3b4f;box-shadow:0 0 0 3px #ff3b4f33}
button{font:inherit;font-size:13px;color:#fff;background:#ffffff10;border:1px solid #ffffff22;border-radius:8px;padding:4px 10px;cursor:pointer}button:hover{background:#ff3b4f33;border-color:#ff3b4f}
.empty{padding:30px;text-align:center;color:#6b6b76}.foot{margin-top:16px;font-size:13px;color:#6b6b76}.badge{display:inline-block;font-size:12px;padding:2px 8px;border-radius:999px;background:#fff;color:#000;margin-left:8px;vertical-align:4px}
</style></head><body><main>
<h1>Streamers on flock.tt${owner ? `<span class="badge">Owner · list is ${PUBLIC ? 'public' : 'private'}</span>` : ''}</h1>
<p>TikTok creators who use flock.tt for their LIVE overlays. A red dot means they're live right now.</p>
<div class="cards"><div class="card"><b>${live}</b><span>Live now</span></div><div class="card"><b>${rows.length}</b><span>Streamers in total</span></div></div>
<div class="wrap"><table><thead><tr><th>Streamer</th><th>Last seen</th><th>Version</th><th>On</th><th>LIVEs</th>${owner ? '<th></th>' : ''}</tr></thead>
<tbody>${rows.length ? rows.map(row).join('') : `<tr><td colspan="${owner ? 6 : 5}" class="empty">Nobody yet.</td></tr>`}</tbody></table></div>
<div class="foot">Streamers can take themselves off this list any time: flock.tt → Settings → turn off “Show me on the public streamer list”.${owner ? ' · This page refreshes every minute.' : ''}</div>
</main></body></html>`;
}

// ── routes ──
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    // the flock.tt app checks in while it's connected to a LIVE
    if (req.method === 'POST' && url.pathname === '/api/heartbeat') {
      if (tooMany(req, 30)) return send(res, 429, { error: 'Slow down' });
      const b = await readJson(req);
      const username = String(b.username || '').replace(/^@/, '').trim();
      const key = String(b.key || '');
      if (!USERNAME.test(username)) return send(res, 400, { error: 'Not a TikTok username' });
      if (key.length < 16 || key.length > 128) return send(res, 400, { error: 'Missing install key' });
      const id = username.toLowerCase(), now = Date.now();
      const cur = streamers.get(id);
      // one copy of flock.tt "owns" each entry, so others can't overwrite or remove it
      if (cur && cur.key && cur.key !== hash(key) && now - cur.lastSeen < LIVE_MS) return send(res, 200, { ok: true, listed: true });
      const newLive = !cur || now - cur.lastSeen > LIVE_MS;
      streamers.set(id, { username, version: clean(b.version, 16), platform: clean(b.platform, 10), firstSeen: cur?.firstSeen || now, lastSeen: now, sessions: (cur?.sessions || 0) + (newLive ? 1 : 0), key: hash(key) });
      dirty = true;
      return send(res, 200, { ok: true, listed: true });
    }
    // the app asks to be taken off the list (Settings → off)
    if (req.method === 'POST' && url.pathname === '/api/forget') {
      if (tooMany(req, 30)) return send(res, 429, { error: 'Slow down' });
      const b = await readJson(req);
      const id = String(b.username || '').replace(/^@/, '').trim().toLowerCase();
      const cur = streamers.get(id);
      if (cur && (same(cur.key, hash(String(b.key || ''))) || isOwner(req))) { streamers.delete(id); dirty = true; }
      return send(res, 200, { ok: true }); // same answer either way, so it can't be used to probe the list
    }
    if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true, streamers: streamers.size });

    // the list: public, or owner-only with PUBLIC=0
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/api/list')) {
      if (!PUBLIC && !isOwner(req)) return askLogin(res);
      if (tooMany(req, 120)) return send(res, 429, { error: 'Slow down' });
      if (url.pathname === '/api/list') return send(res, 200, { live: list().filter((r) => r.live).length, total: streamers.size, streamers: list() }, 'application/json; charset=utf-8', { 'Access-Control-Allow-Origin': PUBLIC ? '*' : 'null' });
      return send(res, 200, page({ owner: false }), 'text/html; charset=utf-8');
    }
    // the owner page: same list, plus Remove buttons
    if (url.pathname === '/admin' && req.method === 'GET') {
      if (!isOwner(req)) return askLogin(res);
      return send(res, 200, page({ owner: true }), 'text/html; charset=utf-8');
    }
    if (url.pathname === '/admin/remove' && req.method === 'POST') {
      if (!isOwner(req)) return askLogin(res);
      // same-site form only: block other websites from posting here with the owner's saved login
      const origin = req.headers.origin;
      if (origin && new URL(origin).host !== req.headers.host) return send(res, 403, { error: 'Blocked' });
      let body = ''; for await (const c of req) { body += c; if (body.length > 512) break; }
      const id = new URLSearchParams(body).get('u')?.toLowerCase();
      if (id && streamers.delete(id)) dirty = true;
      res.writeHead(303, { Location: '/admin' }); return res.end();
    }
    if (req.method === 'DELETE' && url.pathname.startsWith('/api/entry/')) {
      if (!isOwner(req)) return send(res, 401, { error: 'Owner only' });
      const id = decodeURIComponent(url.pathname.slice(11)).toLowerCase();
      const ok = streamers.delete(id); if (ok) dirty = true;
      return send(res, ok ? 200 : 404, { ok });
    }
    send(res, 404, { error: 'Not found' });
  } catch (e) {
    send(res, e.status || 500, { error: e.status ? e.message : 'Something went wrong' });
  }
});
server.headersTimeout = 10_000;
server.requestTimeout = 15_000;
server.listen(PORT, () => console.log(`flock.tt streamer list on http://localhost:${PORT}  (list is ${PUBLIC ? 'PUBLIC' : 'owner-only'}; owner page: /admin)`));
