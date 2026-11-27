// flock.tt (c) 2026 siteflowrespond-bit. Owner proof sha256:99891628516a57a623400d9ccde22b170ecfac1527631e923149d480260a9270
/* flock.tt layout model: runs the small neural network trained in scripts/ai (from scratch, no API)
   right here in the app, then places the overlays it picked with a layout engine.
   The text featurizer must match scripts/ai/spec.py exactly. */
(function () {
  const NEG = new Set(['no', 'without', 'not', 'dont', 'remove', 'minus', 'except', 'skip', 'hate', 'nothing', 'ditch', 'drop', 'nah', 'never', 'w/o', 'wo']);
  const enc = new TextEncoder();
  function fnv1a(s) {
    let h = 0x811c9dc5;
    for (const b of enc.encode(s)) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; }
    return h >>> 0;
  }
  function tokens(text) {
    return text.toLowerCase().replace(/'/g, '').replace(/[^a-z0-9!]+/g, ' ').trim().split(' ').filter(Boolean);
  }
  function features(text, dim) {
    const toks = tokens(text), feats = new Map();
    const add = (key) => { const i = fnv1a(key) % dim; feats.set(i, (feats.get(i) || 0) + 1); };
    let negLeft = 0;
    toks.forEach((w, i) => {
      add(`w:${w}`);
      if (i + 1 < toks.length) add(`b:${w}_${toks[i + 1]}`);
      const p = `#${w}#`;
      for (let j = 0; j < p.length - 2; j++) add(`c:${p.slice(j, j + 3)}`);
      if (negLeft > 0) { add(`n:${w}`); negLeft--; }
      if (NEG.has(w)) negLeft = 3;
    });
    let norm = 0;
    for (const [k, v] of feats) { const l = Math.log1p(v); feats.set(k, l); norm += l * l; }
    norm = Math.sqrt(norm) || 1;
    for (const [k, v] of feats) feats.set(k, v / norm);
    return feats;
  }

  let model = null;
  function layer(L) {
    const bin = atob(L.q), q = new Int8Array(bin.length);
    for (let i = 0; i < bin.length; i++) q[i] = (bin.charCodeAt(i) << 24) >> 24;
    return { rows: L.rows, cols: L.cols, q, scale: Float32Array.from(L.scale), bias: Float32Array.from(L.bias) };
  }
  async function load() {
    if (model) return model;
    const res = await fetch(new URL('ai/layout-model.json', document.baseURI));
    if (!res.ok) throw new Error('Could not load the layout model');
    const m = await res.json();
    model = { ...m, L: Object.fromEntries(Object.entries(m.layers).map(([k, v]) => [k, layer(v)])) };
    return model;
  }
  const dense = (L, x) => {
    const out = new Float32Array(L.rows);
    for (let r = 0; r < L.rows; r++) {
      let s = 0;
      const o = r * L.cols;
      for (let c = 0; c < L.cols; c++) s += L.q[o + c] * x[c];
      out[r] = s * L.scale[r] + L.bias[r];
    }
    return out;
  };

  /** Runs the network. Returns probabilities for every overlay and the most likely value of each setting. */
  async function predict(text) {
    const m = await load();
    const f = features(text, m.dim), H = m.L.hidden;
    const h = new Float32Array(H.rows);
    for (let r = 0; r < H.rows; r++) {
      let s = 0;
      const o = r * H.cols;
      for (const [k, v] of f) s += H.q[o + k] * v;
      h[r] = Math.max(0, s * H.scale[r] + H.bias[r]);
    }
    const ov = dense(m.L.overlays, h);
    const out = { overlays: {} };
    m.labels.overlays.forEach((name, i) => { out.overlays[name] = 1 / (1 + Math.exp(-ov[i])); });
    for (const head of ['orient', 'theme', 'accent', 'goal', 'density']) {
      const z = dense(m.L[head], h);
      let best = 0;
      for (let i = 1; i < z.length; i++) if (z[i] > z[best]) best = i;
      out[head] = m.labels[head][best];
    }
    return out;
  }

  // ── layout engine: turns the model's choices into placed overlays ──
  const SIZE = {
    alerts: [1080, 480], chat: [680, 640], combos: [640, 320], hearts: [300, 900], ticker: [1000, 110], jar: [380, 480], wheel: [720, 820],
    battle: [1000, 260], race: [1000, 330], topgift: [420, 420], emojis: [1080, 900], celebrate: [1080, 1920], stats: [900, 140],
    gifters: [520, 330], counter: [420, 130], timer: [600, 240], record: [520, 210], poll: [620, 380], queue: [460, 420], banner: [900, 90],
    recent: [460, 300], camframe: [1080, 1920], goal: [900, 110]
  };
  const NAME = {
    alerts: 'Alerts', chat: 'Chat', combos: 'Gift combos', hearts: 'Like hearts', ticker: 'Ticker', jar: 'Gift jar', wheel: 'Spin wheel', battle: 'Team battle',
    race: 'Like race', topgift: 'Top gift spotlight', emojis: 'Emoji rain', celebrate: 'Celebrations', stats: 'Stats bar', gifters: 'Top gifters',
    counter: 'Like counter', timer: 'Subathon timer', record: 'Wins & losses', poll: 'Poll', queue: 'Viewer queue', banner: 'Banner', recent: 'Recent followers',
    camframe: 'Camera frame', goal: 'Goal'
  };
  const FILE = { alerts: 'alerts.html', chat: 'chat.html?max=6', combos: 'combos.html', hearts: 'hearts.html', ticker: 'ticker.html', jar: 'jar.html?goal=1000',
    wheel: 'wheel.html?min=100', battle: 'battle.html?time=180', race: 'race.html?goal=300', topgift: 'topgift.html', emojis: 'emojis.html', celebrate: 'celebrate.html?min=100',
    stats: 'stats.html', gifters: 'gifters.html', counter: 'counter.html?stat=likes', timer: 'timer.html', record: 'record.html', poll: 'poll.html', queue: 'queue.html',
    banner: 'banner.html', recent: 'recent.html?type=follow', camframe: 'camframe.html', goal: 'goal.html' };
  const ACCENT_HEX = { red: 'ff3b4f', pink: 'ff4fa3', purple: 'a55bff', blue: '3b82f6', cyan: '22d3ee', green: '22c55e', yellow: 'facc15', orange: 'fb923c', gold: 'f5c542' };
  const FULL = ['celebrate', 'emojis', 'camframe'];
  const BARS = ['stats', 'goal', 'banner', 'ticker', 'battle', 'race'];
  const ORDER = ['poll', 'queue', 'timer', 'record', 'jar', 'topgift', 'gifters', 'combos', 'chat', 'recent', 'wheel', 'counter'];

  /** Shelf-packs boxes into named regions; scales a box down to fit. Returns null if it runs out of room.
      Bars and alerts try the top-centre first; cards go to whichever side column has more room. */
  function pack(items, regions, k) {
    const gap = 20, placed = [], cur = regions.map((r) => ({ ...r, cx: r.x, cy: r.y, row: 0 }));
    const used = (r) => r.cy + r.row - r.y;
    for (const it of items) {
      const cols = cur.filter((r) => r.side).sort((a, b) => used(a) - used(b));
      const order = cur.length === 1 ? cur : it.half ? [...cols, ...cur.filter((r) => !r.side)] : [...cur.filter((r) => !r.side), ...cols];
      let done = false;
      for (const r of order) {
        const maxW = it.half && !r.side ? (r.w - gap) / 2 : r.w; // phone: cards two per row; landscape side columns: one per row
        const s = Math.min(1, maxW / (it.w * k)) * k;
        const w = Math.round(it.w * s / 10) * 10, h = Math.round(it.h * s / 10) * 10;
        let { cx, cy, row } = r;
        if (cx + w > r.x + r.w + 1) { cx = r.x; cy += row + gap; row = 0; }
        if (cy + h > r.y + r.h + 1) continue;
        placed.push({ ...it, x: cx, y: cy, w, h });
        r.cx = cx + w + gap; r.cy = cy; r.row = Math.max(row, h);
        done = true; break;
      }
      if (!done) return null;
    }
    return placed;
  }

  /** Builds a layout { name, width, height, widgets } from the model's answer (or one the user edited). */
  function buildLayout(choice, prompt = '') {
    const land = choice.orient === 'landscape';
    const W = land ? 1920 : 1080, H = land ? 1080 : 1920;
    const want = Object.keys(SIZE).filter((o) => choice.picked.includes(o));
    const params = (o) => {
      let src = FILE[o];
      const add = (k, v) => { src += `${src.includes('?') ? '&' : '?'}${k}=${v}`; };
      if (o === 'goal') add('goal', choice.goal || 'likes');
      if (choice.theme === 'white') add('theme', 'white');
      if (ACCENT_HEX[choice.accent]) add('accent', ACCENT_HEX[choice.accent]);
      return src;
    };
    const widgets = [];
    const full = want.filter((o) => FULL.includes(o));
    for (const o of full) widgets.push({ o, x: 0, y: 0, w: W, h: H });
    let rest = want.filter((o) => !FULL.includes(o) && o !== 'hearts');
    rest.sort((a, b) => (BARS.includes(b) - BARS.includes(a)) || ((b === 'alerts') - (a === 'alerts')) || (ORDER.indexOf(a) - ORDER.indexOf(b)));
    const hearts = want.includes('hearts');
    // where overlays may go: clear of TikTok's own buttons and comments (portrait), or around the game (landscape)
    let regions;
    if (land) {
      regions = [{ x: 580, y: 30, w: 760, h: 300 }, { x: 40, y: 40, w: 520, h: 1000, side: true }, { x: 1360, y: 40, w: 520, h: hearts ? 560 : 1000, side: true }];
      if (hearts) widgets.push({ o: 'hearts', x: 1580, y: 620, w: 300, h: 440 });
    } else {
      regions = [{ x: 40, y: 230, w: hearts ? 740 : 1000, h: 1040 }];
      if (hearts) widgets.push({ o: 'hearts', x: 800, y: 260, w: 260, h: 820 });
    }
    let k = choice.density === 'minimal' ? 0.85 : 1, placed = null;
    const items = rest.map((o) => ({ o, w: SIZE[o][0], h: SIZE[o][1], half: !BARS.includes(o) && o !== 'alerts' }));
    while (!placed && k >= 0.45) { placed = pack(items, regions, k); if (!placed) k = Math.round((k - 0.05) * 100) / 100; }
    const dropped = [];
    while (!placed && items.length) { dropped.push(items.pop().o); placed = pack(items, regions, 0.45); }
    widgets.push(...(placed || []));
    const title = prompt.trim().replace(/\s+/g, ' ').slice(0, 32) || 'AI layout';
    return {
      dropped,
      layout: {
        id: `layout-${Date.now().toString(36)}`, name: `✨ ${title}`, width: W, height: H,
        widgets: widgets.map((w) => ({ id: `w-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: NAME[w.o], src: params(w.o), x: w.x, y: w.y, w: w.w, h: w.h, hidden: false }))
      }
    };
  }

  /** Prompt -> the model's choice (overlays over 50% confidence, plus the settings it picked). */
  async function understand(prompt) {
    const p = await predict(prompt);
    const picked = Object.entries(p.overlays).filter(([, v]) => v > 0.5).sort((a, b) => b[1] - a[1]).map(([k]) => k);
    if (!picked.length) picked.push('alerts');
    return { picked, probs: p.overlays, orient: p.orient, theme: p.theme, accent: p.accent, goal: p.goal, density: p.density };
  }

  window.flockAI = { predict, understand, buildLayout, features, NAME, ACCENT_HEX, OVERLAYS: Object.keys(SIZE) };
})();
