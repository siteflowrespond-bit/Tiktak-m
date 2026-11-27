// flock.tt (c) 2026 siteflowrespond-bit. Owner proof sha256:99891628516a57a623400d9ccde22b170ecfac1527631e923149d480260a9270
/* Layout editor: arrange overlays on one canvas, shown on stream through overlays/scene.html.
   Uses helpers from dashboard.js (config, api, el, icon, toast, saveConfig, markUnsaved, overlayCatalog, copyText). */
/* global config, el, icon, toast, saveConfig, markUnsaved, overlayCatalog, copyText */

const ED_SIZES = window.TT_SIZES; // natural overlay sizes, shared with layout links (overlays/sizes.js)
// Overlays that are effects over the whole picture.
const ED_FULL = new Set(['celebrate.html']);
// Approximate areas the TikTok LIVE app draws on top of a phone stream (1080 x 1920).
const TIKTOK_ZONES = [
  { x: 0, y: 0, w: 1080, h: 210, label: 'Profile, viewers, close' },
  { x: 0, y: 1290, w: 760, h: 470, label: 'Comments' },
  { x: 930, y: 1100, w: 150, h: 660, label: 'Buttons' },
  { x: 0, y: 1770, w: 1080, h: 150, label: 'Comment box & gifts' }
];
// Keep previews quiet while editing.
const ED_QUIET = { 'alerts.html': 'tts=0&volume=0&sounds=0', 'sounds.html': 'volume=0', 'wheel.html': 'sound=0' };

const ed = { id: null, sel: null, s: 1, history: [], frames: new Map(), drag: null };
const $e = (sel) => document.querySelector(sel);
const fileOf = (src) => src.split('?')[0];
const edUid = () => `w-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

function edLayouts() { config.layouts ||= []; if (!config.layouts.length) config.layouts.push({ id: 'main', name: 'My stream', width: 1080, height: 1920, widgets: [] }); return config.layouts; }
function edCur() { return edLayouts().find((l) => l.id === ed.id) || edLayouts()[0]; }
function edSel() { return edCur().widgets.find((w) => w.id === ed.sel) || null; }
function edDirty() { markUnsaved($e('#edSave')); }
function edSnapshot() { ed.history.push(JSON.stringify(edCur())); if (ed.history.length > 60) ed.history.shift(); }
function edUndo() {
  const prev = ed.history.pop();
  if (!prev) { toast('Nothing to undo'); return; }
  const l = edCur();
  Object.assign(l, JSON.parse(prev));
  if (!edSel()) ed.sel = null;
  edDirty(); edRender();
}

// ── toolbar ──
function edRenderBar() {
  const l = edCur();
  ed.id = l.id;
  $e('#edLayout').replaceChildren(...edLayouts().map((x) => el('option', { value: x.id }, x.name)));
  $e('#edLayout').value = l.id;
  $e('#edSize').value = `${l.width}x${l.height}`;
  const url = `${new URL('.', location.href).href}overlays/scene.html?layout=${encodeURIComponent(l.id)}`;
  $e('#edUrl').value = url;
  $e('#edOpen').href = url;
}
$e('#edLayout').addEventListener('change', (e) => { ed.id = e.target.value; ed.sel = null; ed.history = []; edClearFrames(); edRender(); });
$e('#edNew').addEventListener('click', () => {
  const n = edLayouts().length + 1;
  const cur = edCur();
  const l = { id: `layout-${Date.now().toString(36)}`, name: `Layout ${n}`, width: cur.width, height: cur.height, widgets: [] };
  edLayouts().push(l);
  ed.id = l.id; ed.sel = null; ed.history = []; edClearFrames(); edDirty(); edRender();
  toast('New layout. Add overlays from the list, or use "Add a starter set".');
});
$e('#edRename').addEventListener('click', () => { ed.sel = null; edRender(); const i = $e('#edName'); i?.focus(); i?.select(); });
$e('#edDelete').addEventListener('click', () => {
  if (edLayouts().length < 2) { toast('Keep at least one layout', true); return; }
  if (!confirm(`Delete the layout "${edCur().name}"?`)) return;
  config.layouts = edLayouts().filter((x) => x.id !== ed.id);
  ed.id = config.layouts[0].id; ed.sel = null; ed.history = []; edClearFrames(); edDirty(); edRender();
});
$e('#edSize').addEventListener('change', (e) => {
  const [W, H] = e.target.value.split('x').map(Number);
  const l = edCur();
  if (W === l.width && H === l.height) return;
  edSnapshot();
  edResizeCanvas(l, W, H);
  edDirty(); edRender();
  toast(W > H ? 'Landscape. Overlays kept their size and moved to the same spots.' : 'Portrait. Overlays kept their size and moved to the same spots.');
});

/** Change the canvas size without stretching overlays: keep their size, move their centres proportionally. */
function edResizeCanvas(l, W, H) {
  const u = Math.min(W, H) / Math.min(l.width, l.height);
  for (const w of l.widgets) {
    if (w.x <= 0 && w.y <= 0 && w.w >= l.width && w.h >= l.height) { Object.assign(w, { x: 0, y: 0, w: W, h: H }); continue; }
    const cx = ((w.x + w.w / 2) / l.width) * W, cy = ((w.y + w.h / 2) / l.height) * H;
    const nw = Math.min(W, Math.round(w.w * u)), nh = Math.min(H, Math.round(w.h * u));
    w.w = nw; w.h = nh;
    w.x = Math.round(Math.max(0, Math.min(W - nw, cx - nw / 2)));
    w.y = Math.round(Math.max(0, Math.min(H - nh, cy - nh / 2)));
  }
  l.width = W; l.height = H;
}

// Ready-made arrangements for each orientation.
const ED_STARTERS = {
  portrait: [
    ['Celebrations', 'celebrate.html?min=100', 0, 0, 1080, 1920],
    ['Like goal', 'goal.html?goal=likes', 90, 240, 900, 110],
    ['Alerts', 'alerts.html', 0, 470, 1080, 480],
    ['Gift combos', 'combos.html', 20, 960, 640, 320],
    ['Gift jar', 'jar.html?goal=1000', 700, 840, 360, 460]
  ],
  landscape: [
    ['Celebrations', 'celebrate.html?min=100', 0, 0, 1920, 1080],
    ['Stats bar', 'stats.html', 30, 24, 900, 140],
    ['Like goal', 'goal.html?goal=likes', 990, 30, 900, 110],
    ['Alerts', 'alerts.html', 420, 300, 1080, 480],
    ['Gift combos', 'combos.html', 30, 720, 640, 330],
    ['Chat', 'chat.html?max=6', 30, 300, 560, 420],
    ['Gift jar', 'jar.html?goal=1000', 1520, 560, 380, 500]
  ]
};
function edStarter() {
  const l = edCur();
  edSnapshot();
  const set = l.width > l.height ? ED_STARTERS.landscape : ED_STARTERS.portrait;
  const base = l.width > l.height ? [1920, 1080] : [1080, 1920];
  const kx = l.width / base[0], ky = l.height / base[1];
  for (const [name, src, x, y, w, h] of set) {
    l.widgets.push({ id: edUid(), name, src, x: Math.round(x * kx), y: Math.round(y * ky), w: Math.round(w * kx), h: Math.round(h * ky), hidden: false });
  }
  ed.sel = null;
  edDirty(); edRender();
}

// ── ✨ FlockAi: flock.tt's own layout model (public/ai/layout-model.js, trained in scripts/ai) ──
const AI_EXAMPLES = ['chill pink stream with a poll and a like goal', 'landscape gaming layout, no chat', 'subathon with a timer and top gifters',
  'battle stream with wins and losses in gold', 'minimal white just chatting setup', 'play with viewers: queue, poll and chat in blue'];
let aiChoice = null;
function aiOpen() {
  const dlg = $e('#aiDlg');
  $e('#aiAsk').hidden = false; $e('#aiResult').hidden = true;
  $e('#aiExamples').replaceChildren(...AI_EXAMPLES.map((t) => el('button', { class: 'chip', type: 'button', onclick: () => { $e('#aiPrompt').value = t; $e('#aiPrompt').focus(); } }, t)));
  if (!$e('#aiAccent').options.length) $e('#aiAccent').append(el('option', { value: 'none' }, 'None (black & white)'), ...Object.keys(flockAI.ACCENT_HEX).map((c) => el('option', { value: c }, c[0].toUpperCase() + c.slice(1))));
  dlg.showModal();
  $e('#aiPrompt').focus();
}
function aiRenderChips() {
  $e('#aiChips').replaceChildren(...flockAI.OVERLAYS.map((o) => {
    const on = aiChoice.picked.includes(o), p = Math.round((aiChoice.probs[o] || 0) * 100);
    return el('button', { type: 'button', class: `chip${on ? ' on' : ''}`, title: `${p}% sure`, onclick: () => {
      aiChoice.picked = on ? aiChoice.picked.filter((x) => x !== o) : [...aiChoice.picked, o];
      aiRenderChips();
    } }, flockAI.NAME[o], el('small', {}, ` ${p}%`));
  }));
  $e('#aiCreate').disabled = !aiChoice.picked.length;
}
async function aiGenerate() {
  const prompt = $e('#aiPrompt').value.trim();
  if (!prompt) { $e('#aiPrompt').focus(); return; }
  try { aiChoice = await flockAI.understand(prompt); } catch (e) { toast(e.message, true); return; }
  aiChoice.prompt = prompt;
  $e('#aiEcho').textContent = `"${prompt}"`;
  $e('#aiOrient').value = aiChoice.orient; $e('#aiTheme').value = aiChoice.theme; $e('#aiAccent').value = aiChoice.accent; $e('#aiGoal').value = aiChoice.goal;
  aiRenderChips();
  $e('#aiAsk').hidden = true; $e('#aiResult').hidden = false;
}
function aiCreate() {
  const choice = { ...aiChoice, orient: $e('#aiOrient').value, theme: $e('#aiTheme').value, accent: $e('#aiAccent').value, goal: $e('#aiGoal').value };
  const { layout, dropped } = flockAI.buildLayout(choice, choice.prompt);
  edLayouts().push(layout);
  $e('#aiDlg').close();
  edOpenLayout(layout.id);
  edDirty();
  toast(dropped.length ? `FlockAi made your layout. Left out ${dropped.map((d) => flockAI.NAME[d]).join(', ')} so the rest fit; add them from the list.` : 'FlockAi made your layout! Drag anything to adjust, then Save.');
}
$e('#edAI').addEventListener('click', aiOpen);
$e('#aiGo').addEventListener('click', aiGenerate);
$e('#aiPrompt').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); aiGenerate(); } });
$e('#aiBack').addEventListener('click', () => { $e('#aiAsk').hidden = false; $e('#aiResult').hidden = true; $e('#aiPrompt').focus(); });
$e('#aiCreate').addEventListener('click', aiCreate);

$e('#edGuides').addEventListener('change', () => edRenderStage());
$e('#edUndo').addEventListener('click', edUndo);
$e('#edCopy').addEventListener('click', () => { copyText($e('#edUrl').value, $e('#edUrl')); try { localStorage.setItem('usedOverlay', '1'); } catch {} });
$e('#edSave').addEventListener('click', (e) => saveConfig({ layouts: config.layouts }, 'Layout saved. It is live on your stream link.', e.currentTarget));

// ── library ──
function edRenderLib() {
  const f = $e('#edFind').value.trim().toLowerCase();
  const groups = overlayCatalog();
  const out = [];
  for (const g of groups) {
    const items = g.items.filter((i) => !f || `${i.name} ${i.desc}`.toLowerCase().includes(f));
    if (!items.length) continue;
    out.push(el('div', { class: 'g' }, g.title));
    for (const i of items) out.push(el('button', { class: 'item', title: i.desc, onclick: () => edAdd(i) }, icon('plus'), i.name));
  }
  $e('#edLib').replaceChildren(...(out.length ? out : [el('div', { class: 'faint' }, 'No overlays match.')]));
}
$e('#edFind').addEventListener('input', edRenderLib);

function edAdd(item) {
  const l = edCur();
  const src = item.path.replace(/^\/overlays\//, '');
  let [w, h] = ED_SIZES[fileOf(src)] || [600, 400];
  const u = Math.min(l.width, l.height) / 1080; // sizes are designed for the short side being 1080
  w = Math.min(l.width, Math.round(w * u)); h = Math.min(l.height, Math.round(h * u));
  if (ED_FULL.has(fileOf(src))) { w = l.width; h = l.height; }
  edSnapshot();
  const n = l.widgets.length;
  const lift = l.height > l.width ? l.height * 0.12 : 0;
  const x = Math.round((l.width - w) / 2 + ((n % 5) - 2) * 20), y = Math.round(Math.max(0, (l.height - h) / 2 - lift + ((n % 5) - 2) * 20));
  const wd = { id: edUid(), name: item.name, src, x: Math.max(0, Math.min(l.width - w, x)), y: Math.max(0, Math.min(l.height - h, y)), w, h, hidden: false };
  l.widgets.push(wd);
  ed.sel = wd.id;
  edDirty(); edRender();
}

// ── stage ──
function edClearFrames() { for (const f of ed.frames.values()) f.node.remove(); ed.frames.clear(); }

function edFit() {
  const l = edCur(), wrap = $e('#edWrap'), st = $e('#edStage');
  const ww = wrap.clientWidth, wh = wrap.clientHeight;
  if (!ww || !wh) return;
  const pad = 36;
  ed.s = Math.min((ww - pad * 2) / l.width, (wh - pad * 2) / l.height);
  st.style.width = `${l.width}px`; st.style.height = `${l.height}px`;
  st.style.transform = `translate(${(ww - l.width * ed.s) / 2}px, ${(wh - l.height * ed.s) / 2}px) scale(${ed.s})`;
  st.style.setProperty('--s', ed.s);
  $e('#edZoom').textContent = `${l.width} × ${l.height} · ${Math.round(ed.s * 100)}%`;
}
addEventListener('resize', () => { if (document.querySelector('#page-layout.active')) edFit(); });

function edPreviewSrc(src) {
  const quiet = ED_QUIET[fileOf(src)];
  return `overlays/${src}${quiet ? (src.includes('?') ? '&' : '?') + quiet : ''}`;
}

function edRenderStage() {
  const l = edCur(), st = $e('#edStage');
  st.querySelectorAll('.ed-zone').forEach((z) => z.remove());
  const keep = new Set();
  l.widgets.forEach((w, i) => {
    keep.add(w.id);
    let f = ed.frames.get(w.id);
    if (!f) {
      const iframe = el('iframe', { tabIndex: -1, title: w.name });
      const tag = el('div', { class: 'tag' });
      const node = el('div', { class: 'ed-w', 'data-id': w.id }, iframe, tag, ...['nw', 'ne', 'sw', 'se', 'e', 's'].map((d) => el('div', { class: `h ${d}`, 'data-dir': d })));
      f = { node, iframe, tag, src: null };
      ed.frames.set(w.id, f);
      st.append(node);
    }
    const placed = ttPlace(f.iframe, w.src, w.w, w.h); // same scaling as the live layout link
    if (f.src !== placed) { f.src = placed; f.iframe.src = edPreviewSrc(placed); }
    f.tag.textContent = w.hidden ? `${w.name} (hidden)` : w.name;
    Object.assign(f.node.style, { left: `${w.x}px`, top: `${w.y}px`, width: `${w.w}px`, height: `${w.h}px`, zIndex: String(i + 1) });
    f.node.classList.toggle('sel', w.id === ed.sel);
    f.node.classList.toggle('hidden-w', !!w.hidden);
  });
  for (const [id, f] of ed.frames) if (!keep.has(id)) { f.node.remove(); ed.frames.delete(id); }
  if ($e('#edGuides').checked && l.height > l.width) {
    const kx = l.width / 1080, ky = l.height / 1920;
    for (const z of TIKTOK_ZONES) st.append(el('div', { class: 'ed-zone', style: `left:${z.x * kx}px;top:${z.y * ky}px;width:${z.w * kx}px;height:${z.h * ky}px` }, z.label));
  } else if ($e('#edGuides').checked) {
    // Landscape: a 5% safe margin (TVs and players can crop the edges) and the centre lines.
    const mx = Math.round(l.width * 0.05), my = Math.round(l.height * 0.05);
    st.append(el('div', { class: 'ed-zone ed-safe', style: `left:${mx}px;top:${my}px;width:${l.width - mx * 2}px;height:${l.height - my * 2}px` }, 'Safe area: keep text inside'));
    st.append(el('div', { class: 'ed-zone ed-mid', style: `left:${l.width / 2}px;top:0;width:0;height:${l.height}px` }));
    st.append(el('div', { class: 'ed-zone ed-mid', style: `left:0;top:${l.height / 2}px;width:${l.width}px;height:0` }));
  }
  edFit();
}

// ── inspector ──
function edRenderInsp() {
  const l = edCur(), w = edSel(), box = $e('#edInsp');
  const parts = [];
  if (!w) {
    const name = el('input', { id: 'edName', value: l.name });
    name.addEventListener('input', () => { l.name = name.value || 'Untitled'; $e('#edLayout').selectedOptions[0].textContent = l.name; edDirty(); });
    const all = el('select', {}, el('option', { value: '' }, 'Mixed / keep'), THEMES.map(([v, lab]) => el('option', { value: v }, lab)));
    const used = new Set(l.widgets.map((w) => new URLSearchParams(w.src.split('?')[1] || '').get('theme') || 'black'));
    all.value = used.size === 1 ? [...used][0] : '';
    all.addEventListener('change', () => {
      if (!all.value) return;
      edSnapshot();
      for (const w of l.widgets) w.src = withParam(w.src, 'theme', all.value === 'black' ? '' : all.value);
      edDirty(); edRenderStage();
      toast(`Every overlay in this layout now uses ${all.selectedOptions[0].textContent}`);
    });
    parts.push(el('div', { class: 'panel-head' }, el('h2', {}, 'Layout')),
      el('div', { class: 'panel-body' }, el('label', { class: 'f' }, el('span', {}, 'Name'), name),
        el('label', { class: 'f', style: 'margin-top:10px' }, el('span', {}, 'Theme for every overlay'), all),
        el('div', { class: 'f', style: 'margin-top:10px' }, el('span', {}, 'Colours for every overlay'), (() => {
          const sets = l.widgets.map((x) => JSON.stringify(coloursOf(x.src)));
          const same = sets.length && sets.every((x) => x === sets[0]);
          const theme = used.size === 1 ? [...used][0] : 'black';
          return colourControls(same ? JSON.parse(sets[0]) : {}, theme, (c) => {
            edSnapshot();
            for (const x of l.widgets) x.src = withColours(x.src, c);
            edDirty(); edRenderStage(); edRenderInsp();
            toast(Object.keys(c).length ? 'Colours applied to every overlay in this layout' : 'Every overlay is back to its theme colours');
          }, { mixed: !same && sets.some((x) => x !== '{}') });
        })()),
        el('p', { class: 'note', style: 'margin:10px 0 0' }, l.widgets.length ? 'Click an overlay on the canvas to edit it.' : 'Add overlays from the list on the left, or start from a ready-made set.'),
        l.widgets.length ? null : el('button', { class: 'btn red sm', style: 'margin-top:10px', onclick: edStarter }, icon('plus'), `Add a starter set (${l.width > l.height ? 'landscape' : 'portrait'})`)));
  } else {
    const num = (key, label) => {
      const i = el('input', { type: 'number', value: w[key] });
      i.addEventListener('focus', edSnapshot);
      i.addEventListener('input', () => { const v = Math.round(Number(i.value) || 0); w[key] = key === 'w' || key === 'h' ? Math.max(20, v) : v; edDirty(); edRenderStage(); });
      return el('label', { class: 'f' }, el('span', {}, label), i);
    };
    const name = el('input', { value: w.name });
    name.addEventListener('focus', edSnapshot);
    name.addEventListener('input', () => { w.name = name.value; edDirty(); edRenderStage(); edRenderLayers(); });
    const [file, query = ''] = w.src.split('?');
    const opts = el('input', { value: query, placeholder: 'e.g. goal=500&title=Jar', spellcheck: false, class: 'mono' });
    opts.addEventListener('change', () => { edSnapshot(); w.src = query === opts.value ? w.src : `${file}${opts.value.trim() ? `?${opts.value.trim().replace(/^\?/, '')}` : ''}`; edDirty(); edRenderStage(); });
    const align = (label, fn) => el('button', { class: 'btn', onclick: () => { edSnapshot(); fn(); edDirty(); edRender(); } }, label);
    parts.push(el('div', { class: 'panel-head' }, el('h2', {}, w.name || 'Overlay')),
    el('div', { class: 'panel-body', style: 'display:grid;gap:10px' },
      el('label', { class: 'f' }, el('span', {}, 'Name'), name),
      el('div', { class: 'xywh' }, num('x', 'X'), num('y', 'Y'), num('w', 'Width'), num('h', 'Height')),
      el('div', { class: 'f' }, el('span', {}, 'Align on canvas'),
        el('div', { class: 'aligns' },
          align('Left', () => { w.x = 0; }), align('Center', () => { w.x = Math.round((l.width - w.w) / 2); }), align('Right', () => { w.x = l.width - w.w; }),
          align('Top', () => { w.y = 0; }), align('Middle', () => { w.y = Math.round((l.height - w.h) / 2); }), align('Bottom', () => { w.y = l.height - w.h; }))),
      el('button', { class: 'btn sm', onclick: () => { edSnapshot(); Object.assign(w, { x: 0, y: 0, w: l.width, h: l.height }); edDirty(); edRender(); } }, 'Fill the whole screen'),
      el('label', { class: 'f' }, el('span', {}, 'Colour theme'), (() => {
        const sel = el('select', {}, THEMES.map(([v, lab]) => el('option', { value: v }, lab)));
        sel.value = new URLSearchParams(query).get('theme') || 'black';
        sel.addEventListener('change', () => { edSnapshot(); w.src = withParam(w.src, 'theme', sel.value === 'black' ? '' : sel.value); edDirty(); edRenderStage(); edRenderInsp(); });
        return sel;
      })()),
      el('div', { class: 'f' }, el('span', {}, 'Colours'), colourControls(coloursOf(w.src), new URLSearchParams(query).get('theme') || 'black', (c) => { edSnapshot(); w.src = withColours(w.src, c); edDirty(); edRenderStage(); edRenderInsp(); })),
      el('label', { class: 'f' }, el('span', {}, `Options for ${file} (press Enter)`), opts),
      el('div', { class: 'row' },
        el('button', { class: 'btn sm', title: 'Duplicate (Ctrl+D)', onclick: edDuplicate }, icon('dup'), 'Duplicate'),
        el('button', { class: 'btn sm flat', title: 'Delete (Del)', onclick: edDelete }, icon('trash'), 'Delete'))));
  }
  parts.push(el('div', { class: 'panel-head', style: 'border-top:1px solid var(--line)' }, el('h2', {}, 'Layers'), el('div', { class: 'grow' }), el('span', { class: 'faint', style: 'font-size:12px' }, 'top = front')),
    el('div', { class: 'panel-body', style: 'padding:6px' }, el('div', { class: 'layers', id: 'edLayers' })));
  box.replaceChildren(...parts);
  edRenderLayers();
}

function edRenderLayers() {
  const l = edCur(), list = $e('#edLayers');
  if (!list) return;
  if (!l.widgets.length) { list.replaceChildren(el('div', { class: 'faint', style: 'padding:6px 8px;font-size:13px' }, 'No overlays yet.')); return; }
  const rows = [...l.widgets].map((w, i) => [w, i]).reverse().map(([w, i]) => el('div', { class: `layer${w.id === ed.sel ? ' sel' : ''}${w.hidden ? ' off' : ''}`, onclick: () => { ed.sel = w.id; edRender(); } },
    el('span', {}, w.name || w.src),
    el('div', { class: 'row', style: 'gap:2px;flex-wrap:nowrap', onclick: (e) => e.stopPropagation() },
      el('button', { class: 'btn flat sq', title: 'Bring forward', disabled: i === l.widgets.length - 1, onclick: () => edMove(i, 1) }, icon('up')),
      el('button', { class: 'btn flat sq', title: 'Send backward', disabled: i === 0, onclick: () => edMove(i, -1) }, icon('down')),
      el('button', { class: 'btn flat sq', title: w.hidden ? 'Show' : 'Hide', onclick: () => { edSnapshot(); w.hidden = !w.hidden; edDirty(); edRender(); } }, icon(w.hidden ? 'eyeoff' : 'eye')))));
  list.replaceChildren(...rows);
}
function edMove(i, d) {
  const ws = edCur().widgets, j = i + d;
  if (j < 0 || j >= ws.length) return;
  edSnapshot();
  [ws[i], ws[j]] = [ws[j], ws[i]];
  edDirty(); edRender();
}
function edDuplicate() {
  const w = edSel(); if (!w) return;
  edSnapshot();
  const c = { ...w, id: edUid(), name: `${w.name} copy`, x: w.x + 30, y: w.y + 30 };
  edCur().widgets.push(c); ed.sel = c.id; edDirty(); edRender();
}
function edDelete() {
  const l = edCur(); if (!ed.sel) return;
  edSnapshot();
  l.widgets = l.widgets.filter((w) => w.id !== ed.sel); ed.sel = null; edDirty(); edRender();
}

// ── dragging & resizing ──
function edGuides(lines) {
  const st = $e('#edStage');
  st.querySelectorAll('.ed-guide').forEach((g) => g.remove());
  const t = 2 / ed.s;
  for (const [axis, v] of lines) st.append(el('div', { class: 'ed-guide', style: axis === 'x' ? `left:${v}px;top:0;width:${t}px;height:100%` : `top:${v}px;left:0;height:${t}px;width:100%` }));
}

$e('#edStage').addEventListener('pointerdown', (e) => {
  const node = e.target.closest('.ed-w');
  if (!node) { ed.sel = null; edRender(); return; }
  e.preventDefault();
  ed.sel = node.dataset.id;
  const w = edSel();
  ed.drag = { dir: e.target.dataset.dir || 'move', sx: e.clientX, sy: e.clientY, o: { ...w }, before: JSON.stringify(edCur()) };
  node.setPointerCapture(e.pointerId);
  edRenderStage(); edRenderInsp();
});

$e('#edStage').addEventListener('pointermove', (e) => {
  const d = ed.drag; if (!d) return;
  const w = edSel(), l = edCur(); if (!w) return;
  const dx = (e.clientX - d.sx) / ed.s, dy = (e.clientY - d.sy) / ed.s;
  const snap = $e('#edSnap').checked && !e.altKey;
  const g = (v) => (snap ? Math.round(v / 10) * 10 : Math.round(v));
  const lines = [];
  const T = 14 / ed.s;
  if (d.dir === 'move') {
    let x = d.o.x + dx, y = d.o.y + dy;
    if (snap) {
      // snap edges and centre to the canvas edges and centre
      const snapTo = (pos, size, total, axis) => {
        for (const v of [0, total / 2, total]) for (const k of [0, size / 2, size]) {
          if (Math.abs(pos + k - v) < T) { lines.push([axis, v]); return v - k; }
        }
        return pos;
      };
      x = snapTo(x, w.w, l.width, 'x');
      y = snapTo(y, w.h, l.height, 'y');
    }
    w.x = lines.some(([a]) => a === 'x') ? Math.round(x) : g(x);
    w.y = lines.some(([a]) => a === 'y') ? Math.round(y) : g(y);
  } else {
    let { x, y, w: ww, h: hh } = d.o;
    if (d.dir.includes('e')) ww = d.o.w + dx;
    if (d.dir.includes('s')) hh = d.o.h + dy;
    if (d.dir.includes('w')) { ww = d.o.w - dx; x = d.o.x + dx; }
    if (d.dir.includes('n')) { hh = d.o.h - dy; y = d.o.y + dy; }
    if (e.shiftKey && d.dir.length === 2) { const r = d.o.w / d.o.h; if (ww / hh > r) hh = ww / r; else ww = hh * r; if (d.dir.includes('w')) x = d.o.x + d.o.w - ww; if (d.dir.includes('n')) y = d.o.y + d.o.h - hh; }
    ww = Math.max(40, g(ww)); hh = Math.max(40, g(hh));
    if (d.dir.includes('w')) x = d.o.x + d.o.w - ww;
    if (d.dir.includes('n')) y = d.o.y + d.o.h - hh;
    Object.assign(w, { x: Math.round(x), y: Math.round(y), w: Math.round(ww), h: Math.round(hh) });
  }
  edGuides(lines);
  const f = ed.frames.get(w.id);
  Object.assign(f.node.style, { left: `${w.x}px`, top: `${w.y}px`, width: `${w.w}px`, height: `${w.h}px` });
});

function edEndDrag() {
  const d = ed.drag; if (!d) return;
  ed.drag = null;
  edGuides([]);
  if (JSON.stringify(edCur()) !== d.before) { ed.history.push(d.before); edDirty(); }
  edRenderInsp();
}
$e('#edStage').addEventListener('pointerup', edEndDrag);
$e('#edStage').addEventListener('pointercancel', edEndDrag);

document.addEventListener('keydown', (e) => {
  if (!document.querySelector('#page-layout.active')) return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); edUndo(); return; }
  if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); $e('#edSave').click(); return; }
  if (!mod && !e.altKey) {
    const k = e.key.toLowerCase();
    if (k === 'f') { e.preventDefault(); $e('#edFull').click(); return; }
    if (k === 'p') { e.preventDefault(); $e('#edPreview').click(); return; }
    if (k === 'h') { e.preventDefault(); $e('#edPanels').click(); return; }
  }
  if (e.key === 'Escape' && !edSel() && document.body.classList.contains('ed-full')) { edSetFull(false); return; }
  const w = edSel(); if (!w) return;
  if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); edDuplicate(); return; }
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); edDelete(); return; }
  if (e.key === 'Escape') { ed.sel = null; edRender(); return; }
  const step = e.shiftKey ? 10 : 1;
  const mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
  if (mv) {
    e.preventDefault();
    if (!e.repeat) edSnapshot();
    w.x += mv[0]; w.y += mv[1];
    edDirty(); edRenderStage(); edRenderInsp();
  }
});

function edRender() { edRenderBar(); edRenderStage(); edRenderInsp(); }

// ── full screen, panels and preview ──
function edSetFull(on) {
  document.body.classList.toggle('ed-full', on);
  $e('#edFull').replaceChildren(icon(on ? 'shrink' : 'expand'), on ? 'Exit full screen' : 'Full screen');
  try {
    if (on && !document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
    if (!on && document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  } catch {}
  requestAnimationFrame(edFit);
}
function edSetPanels(show) {
  document.body.classList.toggle('ed-bare', !show);
  $e('#edPanels').replaceChildren(icon('panels'), show ? 'Hide panels' : 'Show panels');
  requestAnimationFrame(edFit);
}
function edSetPreview(on) {
  $e('#edStage').classList.toggle('ed-preview', on);
  $e('#edPreview').classList.toggle('on', on);
  if (on) { ed.sel = null; edRenderStage(); edRenderInsp(); }
}
$e('#edFull').addEventListener('click', () => edSetFull(!document.body.classList.contains('ed-full')));
$e('#edPanels').addEventListener('click', () => edSetPanels(document.body.classList.contains('ed-bare')));
$e('#edPreview').addEventListener('click', () => edSetPreview(!$e('#edStage').classList.contains('ed-preview')));
document.addEventListener('fullscreenchange', () => {
  // leaving the browser's full screen (Esc) also leaves the editor's full screen mode
  if (!document.fullscreenElement && document.body.classList.contains('ed-full')) edSetFull(false);
});

function edOpenLayout(id) { ed.id = id; ed.sel = null; ed.history = []; edClearFrames(); edRender(); }

// called by dashboard.js once the config is loaded
function initEditor() {
  if (ed.ready) return;
  ed.ready = true;
  ed.id = edLayouts()[0].id;
  edRenderLib();
  edRender();
  // the stage can only be measured while the page is visible
  new MutationObserver(() => { if (document.querySelector('#page-layout.active')) edFit(); })
    .observe($e('#page-layout'), { attributes: true, attributeFilter: ['class'] });
}

// If the dashboard finished loading before this script did, start now.
if (typeof config !== 'undefined' && config) initEditor();
