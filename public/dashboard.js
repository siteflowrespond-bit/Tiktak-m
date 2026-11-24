/* global io */
const $ = (sel) => document.querySelector(sel);
const socket = io();
let config = null;
let sounds = []; // sound library [{ kind, name, src }]
let gifts = []; // gift catalogue [{ name, diamonds }]

// ── helpers ──────────────────────────────────────────────
async function api(method, url, body, raw) {
  const res = await fetch(url, {
    method,
    headers: raw ? { 'Content-Type': raw.type || 'application/octet-stream' } : { 'Content-Type': 'application/json' },
    body: raw || (body ? JSON.stringify(body) : undefined)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

function toast(msg, isError = false) {
  const t = el('div', { class: `toast${isError ? ' err' : ''}` }, msg);
  $('#toasts').append(t);
  setTimeout(() => t.remove(), 3000);
}

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null) continue;
    if (k === 'class') node.className = v;
    else if (k === 'style') node.style.cssText = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k in node) node[k] = v;
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null && c !== false) node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return node;
}

function icon(name) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'i');
  const use = document.createElementNS(ns, 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.append(use);
  return svg;
}

const fmt = (n) => Number(n || 0).toLocaleString();
const hhmm = (ts) => new Date(ts || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
const field = (label, input, cls) => el('label', { class: `f ${cls || ''}` }, el('span', {}, label), input);
const uid = (p) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

const EVENTS = {
  chat: { label: 'chat', color: 'var(--dim)' },
  gift: { label: 'gift', color: 'var(--amber)' },
  follow: { label: 'follow', color: 'var(--red)' },
  share: { label: 'share', color: 'var(--blue)' },
  like: { label: 'like', color: '#f28ab2' },
  join: { label: 'join', color: 'var(--green)' },
  subscribe: { label: 'sub', color: 'var(--plum)' }
};

// ── navigation ───────────────────────────────────────────
const TITLES = { live: 'Live', actions: 'Alerts', sounds: 'Sounds', goals: 'Goals & timer', overlays: 'Overlays', settings: 'Settings' };
function showPage(page) {
  if (!TITLES[page]) page = 'live';
  document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('active', b.dataset.page === page));
  document.querySelectorAll('.page').forEach((s) => s.classList.toggle('active', s.id === `page-${page}`));
  $('#pageTitle').textContent = TITLES[page];
  try { localStorage.setItem('page', page); } catch {}
}
$('#nav').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) showPage(b.dataset.page); });
try { showPage(localStorage.getItem('page')); } catch { showPage('live'); }
$('#foot').textContent = `v0.3 · ${location.host}`;

// ── connection ───────────────────────────────────────────
let status = 'disconnected';
let liveSince = 0;
$('#connectForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (status !== 'disconnected') { await api('POST', '/api/disconnect').catch(() => {}); return; }
  $('#connectBtn').disabled = true;
  try {
    await api('POST', '/api/connect', { username: $('#username').value.trim() });
    loadGifts();
  } catch (err) {
    toast(err.message, true);
  } finally {
    $('#connectBtn').disabled = false;
  }
});

socket.on('status', ({ status: s, username, detail }) => {
  status = s;
  liveSince = s === 'connected' ? liveSince || Date.now() : 0;
  $('#onair').className = `onair ${s}`;
  $('#onair').title = [username && `@${username}`, detail].filter(Boolean).join(' · ');
  $('#connectBtn').textContent = s === 'disconnected' ? 'Connect' : s === 'connected' ? 'Disconnect' : 'Stop';
  $('#connectBtn').classList.toggle('red', s === 'disconnected');
  $('#username').disabled = s !== 'disconnected';
  drawOnAir();
});
function drawOnAir() {
  const txt = $('#onairText');
  if (status === 'connected') {
    const s = Math.floor((Date.now() - liveSince) / 1000);
    txt.textContent = `On air ${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  } else {
    txt.textContent = { connecting: 'Connecting', error: 'Waiting', disconnected: 'Offline' }[status] || status;
  }
}
setInterval(drawOnAir, 1000);

// ── stats ────────────────────────────────────────────────
const STATS = [['viewers', 'Viewers'], ['likes', 'Likes'], ['coins', 'Coins'], ['follows', 'Follows'], ['shares', 'Shares'], ['comments', 'Comments']];
$('#strip').append(...STATS.map(([k, label]) => el('div', {}, el('div', { class: 'k' }, label), el('div', { class: 'v', id: `v-${k}` }, '0'))));
let stats = {};
socket.on('stats', (s) => {
  for (const [k] of STATS) {
    const v = $(`#v-${k}`);
    v.textContent = fmt(s[k]);
    if (stats[k] !== undefined && s[k] > stats[k]) { v.classList.remove('up'); void v.offsetWidth; v.classList.add('up'); }
  }
  stats = s;
  const top = (s.topGifters || []).slice(0, 5);
  $('#gifters').replaceChildren(...(top.length
    ? top.map((g, i) => el('div', { class: 'item' }, el('span', { class: 'n' }, i + 1), el('span', { class: 'nm' }, g.user.nickname), el('span', { class: 'amt' }, fmt(g.coins))))
    : [el('div', { class: 'faint', style: 'padding:8px 0' }, 'No gifts yet.')]));
  drawGoalMini();
});
function drawGoalMini() {
  if (!config) return;
  const on = Object.entries(config.goals).filter(([, g]) => g.enabled);
  $('#goalMini').replaceChildren(...(on.length ? on.map(([k, g]) => el('div', { class: 'goalline' },
    el('div', { class: 'row' }, el('span', {}, g.label), el('span', { class: 'mono muted' }, `${fmt(stats[k])} / ${fmt(g.target)}`)),
    el('div', { class: 'meter' }, el('i', { style: `width:${Math.min(100, ((stats[k] || 0) / g.target) * 100)}%` }))))
    : [el('div', { class: 'faint' }, 'All goals are off.')]));
}
$('#resetStats').addEventListener('click', () => { if (confirm('Reset all stats and leaderboards?')) api('POST', '/api/reset-stats'); });

// ── activity log ─────────────────────────────────────────
const log = $('#log');
const hiddenByDefault = new Set(['like', 'join']);
$('#filters').append(...Object.entries(EVENTS).map(([t, m]) =>
  el('label', {}, el('input', { type: 'checkbox', value: t, checked: !hiddenByDefault.has(t) }), m.label)));
const showing = () => new Set([...document.querySelectorAll('#filters input:checked')].map((i) => i.value));

function describe(e) {
  switch (e.type) {
    case 'chat': return e.comment;
    case 'gift': return [el('span', { class: 'd' }, `sent ${e.gift.count > 1 ? `${e.gift.count} × ` : ''}${e.gift.name} `), el('span', { class: 'amt' }, `${fmt(e.gift.coins)}c`)];
    case 'like': return el('span', { class: 'd' }, `+${e.likes} likes`);
    case 'follow': return el('span', { class: 'd' }, 'followed');
    case 'share': return el('span', { class: 'd' }, 'shared the stream');
    case 'join': return el('span', { class: 'd' }, 'joined');
    case 'subscribe': return el('span', { class: 'd' }, 'subscribed');
    default: return e.type;
  }
}

socket.on('event', (e) => {
  if (e.type === 'streamEnd') { toast('The LIVE ended.'); return; }
  if (!EVENTS[e.type] || !showing().has(e.type)) return;
  $('#logEmpty')?.remove();
  const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 50;
  log.append(el('div', { class: `line ${e.type}`, style: `--c:${EVENTS[e.type].color}` },
    el('span', { class: 't' }, hhmm(e.ts)),
    el('span', { class: 'ty' }, EVENTS[e.type].label),
    el('span', { class: 'msg' }, el('b', {}, e.user?.nickname || ''), describe(e))));
  while (log.children.length > 400) log.firstChild.remove();
  if (atBottom) log.scrollTop = log.scrollHeight;
});
$('#clearLog').addEventListener('click', () => log.replaceChildren());

// ── test events ──────────────────────────────────────────
$('#simBtns').append(...[['follow', 'Follow'], ['share', 'Share'], ['like', 'Likes'], ['chat', 'Chat'], ['join', 'Join'], ['subscribe', 'Subscribe']]
  .map(([t, l]) => el('button', { class: 'btn', 'data-sim': t }, l)));
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-sim]');
  if (!b) return;
  const body = { type: b.dataset.sim };
  if (body.type === 'gift') body.giftName = $('#simGift').value;
  api('POST', '/api/simulate', body).catch((err) => toast(err.message, true));
});
$('#simChatForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const comment = $('#simChat').value.trim();
  if (comment) api('POST', '/api/simulate', { type: 'chat', comment });
  $('#simChat').value = '';
});

// ── shared trigger editor ────────────────────────────────
const TRIGGERS = [['gift', 'Gift'], ['follow', 'Follow'], ['share', 'Share'], ['like', 'Likes'], ['command', 'Chat command'], ['chat', 'Chat keyword'], ['join', 'Viewer joins'], ['subscribe', 'Subscribe']];

function triggerSelect(owner, onChange) {
  const sel = el('select', {}, TRIGGERS.map(([v, l]) => el('option', { value: v }, l)));
  sel.value = owner.trigger.type;
  sel.addEventListener('change', () => { owner.trigger = { type: sel.value }; onChange(); });
  return sel;
}

function bind(obj, key, input, cast, after) {
  input.value = obj[key] ?? '';
  input.addEventListener('input', () => { obj[key] = cast ? cast(input.value) : input.value; after?.(); });
  return input;
}
const num = (v) => (v === '' ? '' : Number(v));

/** Inputs for the trigger's own settings (gift name, coin range, command …). */
function triggerDetails(t, after, compact = false) {
  switch (t.type) {
    case 'gift': {
      const name = bind(t, 'giftName', el('input', { list: 'giftList', placeholder: 'Any gift' }), null, after);
      const min = bind(t, 'minCoins', el('input', { type: 'number', min: 0, placeholder: 'min' }), num, after);
      const max = bind(t, 'maxCoins', el('input', { type: 'number', min: 0, placeholder: 'max' }), num, after);
      if (compact) return [el('div', { class: 'row', style: 'flex-wrap:nowrap' }, el('div', { class: 'grow' }, name), el('div', { style: 'width:74px' }, min), el('div', { style: 'width:74px' }, max))];
      return [field('Gift (blank = any)', name), field('Min coins', min), field('Max coins', max)];
    }
    case 'command': {
      const i = bind(t, 'command', el('input', { placeholder: '!command' }), null, after);
      return [compact ? i : field('Command', i)];
    }
    case 'chat': {
      const i = bind(t, 'keyword', el('input', { placeholder: 'any message' }), null, after);
      return [compact ? i : field('Message contains', i)];
    }
    case 'like': {
      const i = bind(t, 'minLikes', el('input', { type: 'number', min: 1, placeholder: 'min likes' }), num, after);
      return [compact ? i : field('At least this many likes at once', i)];
    }
    default:
      return [compact ? el('span', { class: 'faint' }, '—') : null];
  }
}

function triggerText(t) {
  switch (t.type) {
    case 'gift': {
      const min = Number(t.minCoins) || 0, max = Number(t.maxCoins) || 0;
      const range = min && max ? `${fmt(min)}–${fmt(max)} coins` : min > 1 ? `${fmt(min)}+ coins` : max ? `up to ${fmt(max)} coins` : '';
      return [t.giftName || 'Any gift', range].filter(Boolean).join(', ');
    }
    case 'command': return `Chat says ${t.command || '(no command)'}`;
    case 'chat': return t.keyword ? `Chat contains "${t.keyword}"` : 'Any chat message';
    case 'like': return `${t.minLikes || 1}+ likes`;
    default: return TRIGGERS.find(([v]) => v === t.type)?.[1] || t.type;
  }
}

function soundSelect(value, onChange, { allowNone = true } = {}) {
  const sel = el('select', {},
    allowNone ? el('option', { value: '' }, 'No sound') : null,
    el('optgroup', { label: 'Built-in' }, sounds.filter((s) => s.kind === 'builtin').map((s) => el('option', { value: s.src }, s.name))),
    sounds.some((s) => s.kind === 'custom') ? el('optgroup', { label: 'Uploaded' }, sounds.filter((s) => s.kind === 'custom').map((s) => el('option', { value: s.src }, s.name))) : null);
  if (value && !sounds.some((s) => s.src === value)) sel.append(el('option', { value }, value));
  sel.value = value || '';
  sel.addEventListener('change', () => onChange(sel.value));
  return sel;
}

let previewAudio = null;
function preview(src, volume = 1) {
  if (!src) return;
  previewAudio?.pause();
  previewAudio = new Audio(src);
  previewAudio.volume = Math.min(1, volume);
  previewAudio.play().catch(() => toast('Could not play that file', true));
}

function markUnsaved(btn) { btn.classList.add('unsaved'); }
window.addEventListener('beforeunload', (e) => { if (document.querySelector('.unsaved')) { e.preventDefault(); e.returnValue = ''; } });

async function saveConfig(partial, msg, btn) {
  try {
    const saved = await api('PUT', '/api/config', partial);
    config = { ...config, ...saved };
    btn?.classList.remove('unsaved');
    toast(msg);
    return true;
  } catch (e) { toast(e.message, true); return false; }
}

// ── alerts ───────────────────────────────────────────────
const VARS = ['nickname', 'username', 'avatar', 'giftName', 'giftImage', 'count', 'coins', 'comment', 'likes'];
const openRules = new Set();

function renderRuleCount() { $('#ruleCount').textContent = `${config.rules.filter((r) => r.enabled).length} of ${config.rules.length} alerts on`; }

function renderRules() {
  renderRuleCount();
  if (!config.rules.length) { $('#rules').replaceChildren(el('div', { class: 'panel-body faint' }, 'No alerts. Add one to show something on screen when a viewer does something.')); return; }
  $('#rules').replaceChildren(...config.rules.map(renderRule));
}

function renderRule(rule, idx) {
  rule.alert ||= { text: '', image: '', sound: '', duration: 4 };
  const dirty = () => markUnsaved($('#saveRules'));
  const box = el('div', { class: `rule${rule.enabled ? '' : ' off'}${openRules.has(rule.id) ? ' open' : ''}` });
  const sum = el('div', { class: 'rule-sum' });
  const name = el('div', { class: 'rule-name' });
  const refresh = () => {
    name.textContent = rule.name || 'Untitled';
    const out = [rule.alert.text && `show "${rule.alert.text}"`, rule.alert.sound && 'sound', rule.tts && 'speak'].filter(Boolean).join(' + ') || 'does nothing yet';
    sum.replaceChildren(triggerText(rule.trigger), el('span', { class: 'arrow' }, '→'), out, Number(rule.cooldown) ? ` · ${rule.cooldown}s cooldown` : '');
  };
  const change = () => { dirty(); refresh(); };

  const on = el('input', { type: 'checkbox', checked: rule.enabled, title: 'On/off', onclick: (e) => e.stopPropagation() });
  on.addEventListener('change', () => { rule.enabled = on.checked; box.classList.toggle('off', !on.checked); dirty(); renderRuleCount(); });

  const top = el('div', { class: 'rule-top', onclick: () => { box.classList.toggle('open'); if (box.classList.contains('open')) openRules.add(rule.id); else openRules.delete(rule.id); } },
    on, el('div', {}, name, sum),
    el('div', { class: 'row', onclick: (e) => e.stopPropagation() },
      el('button', { class: 'btn sm', onclick: () => testRule(rule) }, 'Test'),
      el('button', { class: 'btn flat sq', title: 'Delete', onclick: () => { if (confirm(`Delete "${rule.name}"?`)) { config.rules.splice(idx, 1); dirty(); renderRules(); } } }, icon('trash'))));

  const edit = el('div', { class: 'rule-edit' },
    el('div', { class: 'form' }, field('Name', bind(rule, 'name', el('input'), null, change), 'span2')),
    el('div', { class: 'sub' }, 'When'),
    el('div', { class: 'form' },
      field('Event', triggerSelect(rule, () => { dirty(); renderRules(); })),
      ...triggerDetails(rule.trigger, change),
      field('Cooldown (sec)', bind(rule, 'cooldown', el('input', { type: 'number', min: 0 }), Number, change))),
    el('div', { class: 'sub' }, 'Show'),
    el('div', { class: 'form' },
      field('Text', bind(rule.alert, 'text', el('input', { placeholder: 'empty = no alert' }), null, change), 'span2'),
      field('Image / GIF URL', bind(rule.alert, 'image', el('input', { placeholder: '{avatar}' }), null, change)),
      field('Seconds on screen', bind(rule.alert, 'duration', el('input', { type: 'number', min: 1 }), Number, change)),
      field('Sound', el('div', { class: 'row', style: 'flex-wrap:nowrap' },
        el('div', { class: 'grow' }, soundSelect(rule.alert.sound, (v) => { rule.alert.sound = v; change(); })),
        el('button', { class: 'btn sq', type: 'button', title: 'Preview', onclick: () => preview(rule.alert.sound) }, icon('play')))),
      field('Say out loud', bind(rule, 'tts', el('input', { placeholder: 'Thanks {nickname}!' }), null, change), 'span2')),
    el('div', { class: 'sub' }, 'Placeholders'),
    el('div', { class: 'vars' }, VARS.map((v) => el('code', { title: 'Copy', onclick: () => navigator.clipboard?.writeText(`{${v}}`).then(() => toast(`Copied {${v}}`)) }, `{${v}}`))));

  refresh();
  box.append(top, edit);
  return box;
}

function testRule(rule) {
  const sample = { nickname: 'test_viewer', username: 'test_viewer', avatar: '', giftName: rule.trigger.giftName || 'Rose', giftImage: '', count: 3, coins: 3, comment: rule.trigger.command || 'hello', likes: 15 };
  const fill = (s) => String(s || '').replace(/\{(\w+)\}/g, (m, k) => (k in sample ? sample[k] : m));
  api('POST', '/api/test-alert', { text: fill(rule.alert.text), image: fill(rule.alert.image), sound: rule.alert.sound, duration: rule.alert.duration, tts: fill(rule.tts) })
    .then(() => toast('Sent to the Alerts overlay'));
}

$('#addRule').addEventListener('click', () => {
  const id = uid('rule');
  config.rules.unshift({ id, enabled: true, name: 'New alert', trigger: { type: 'follow' }, alert: { text: '{nickname} followed', image: '{avatar}', sound: '', duration: 4 }, tts: '', cooldown: 0 });
  openRules.add(id);
  markUnsaved($('#saveRules'));
  renderRules();
});
$('#saveRules').addEventListener('click', (e) => saveConfig({ rules: config.rules }, 'Alerts saved', e.currentTarget));

// ── sound actions ────────────────────────────────────────
function renderSoundRules() {
  const list = config.sounds.rules;
  const dirty = () => markUnsaved($('#saveSounds'));
  if (!list.length) { $('#soundRules').replaceChildren(el('div', { class: 'panel-body faint' }, 'No sound actions yet.')); return; }
  $('#soundRules').replaceChildren(...list.map((r, idx) => {
    const row = el('div', { class: `snd${r.enabled ? '' : ' off'}` });
    const on = el('input', { type: 'checkbox', checked: r.enabled, title: 'On/off' });
    on.addEventListener('change', () => { r.enabled = on.checked; row.classList.toggle('off', !on.checked); dirty(); });
    const vol = el('input', { type: 'range', min: 0, max: 1, step: 0.05, value: r.volume ?? 1, title: 'Volume' });
    vol.addEventListener('input', () => { r.volume = Number(vol.value); dirty(); });
    const repeat = el('input', { type: 'checkbox', checked: !!r.repeat });
    repeat.addEventListener('change', () => { r.repeat = repeat.checked; dirty(); });
    row.append(
      on,
      triggerSelect(r, () => { dirty(); renderSoundRules(); }),
      el('div', {}, triggerDetails(r.trigger, dirty, true)),
      el('div', { class: 'row', style: 'flex-wrap:nowrap' },
        el('div', { class: 'grow' }, soundSelect(r.sound, (v) => { r.sound = v; dirty(); }, { allowNone: false })),
        el('button', { class: 'btn sq', title: 'Preview', onclick: () => preview(r.sound, r.volume) }, icon('play'))),
      vol,
      el('div', { class: 'opts' },
        r.trigger.type === 'gift' ? el('label', { class: 'check', title: 'Play once per gift in a combo (max 10)' }, repeat, 'per gift') : null,
        el('label', { class: 'check', title: 'Cooldown in seconds' }, 'wait', bind(r, 'cooldown', el('input', { type: 'number', min: 0 }), Number, dirty), 's'),
        el('button', { class: 'btn flat sq', title: 'Delete', onclick: () => { list.splice(idx, 1); dirty(); renderSoundRules(); } }, icon('trash'))));
    return row;
  }));
}
$('#addSound').addEventListener('click', () => {
  config.sounds.rules.push({ id: uid('s'), enabled: true, trigger: { type: 'gift', giftName: '' }, sound: sounds[0]?.src || '', volume: 0.8, repeat: false, cooldown: 0 });
  markUnsaved($('#saveSounds'));
  renderSoundRules();
});
$('#saveSounds').addEventListener('click', (e) => {
  config.sounds.volume = Number($('#master').value);
  config.sounds.maxAtOnce = Number($('#maxAtOnce').value) || 4;
  saveConfig({ sounds: config.sounds }, 'Sounds saved', e.currentTarget);
});
$('#master').addEventListener('input', (e) => { $('#masterVal').textContent = `${Math.round(e.target.value * 100)}%`; markUnsaved($('#saveSounds')); });
$('#maxAtOnce').addEventListener('input', () => markUnsaved($('#saveSounds')));

function renderLibrary() {
  $('#library').replaceChildren(...sounds.map((s) => el('div', { class: `s ${s.kind}` },
    el('span', { title: s.name }, s.name),
    el('button', { class: 'btn flat', title: 'Preview here', onclick: () => preview(s.src) }, icon('play')),
    el('button', { class: 'btn flat', title: 'Play on stream', onclick: () => api('POST', '/api/play-sound', { src: s.src }) }, icon('cast')),
    s.kind === 'custom' ? el('button', { class: 'btn flat', title: 'Delete', onclick: async () => {
      if (!confirm(`Delete ${s.name}?`)) return;
      await api('DELETE', `/api/sounds/${s.src.split('/').pop()}`);
      await loadSounds();
    } }, icon('trash')) : null)));
}
async function loadSounds() {
  sounds = await api('GET', '/api/sounds');
  renderLibrary();
  if (config) { renderSoundRules(); renderRules(); }
}
$('#upload').addEventListener('change', async (e) => {
  for (const file of e.target.files) {
    try { await api('POST', `/api/sounds?name=${encodeURIComponent(file.name)}`, null, file); toast(`Added ${file.name}`); } catch (err) { toast(`${file.name}: ${err.message}`, true); }
  }
  e.target.value = '';
  loadSounds();
});

// play sound actions locally if asked
const playHere = () => { try { return localStorage.getItem('playHere') === '1'; } catch { return false; } };
$('#playHere').addEventListener('change', (e) => { try { localStorage.setItem('playHere', e.target.checked ? '1' : '0'); } catch {} });
socket.on('sound', ({ src, volume = 1, times = 1 }) => {
  if (!playHere()) return;
  for (let i = 0; i < times; i++) setTimeout(() => { const a = new Audio(src); a.volume = Math.min(1, volume); a.play().catch(() => {}); }, i * 140);
});

// ── text-to-speech ───────────────────────────────────────
const synth = window.speechSynthesis;
function loadVoices() {
  if (!synth || !config) return;
  $('#ttsVoice').replaceChildren(el('option', { value: '' }, 'System default'), ...synth.getVoices().map((v) => el('option', { value: v.name }, `${v.name} (${v.lang})`)));
  $('#ttsVoice').value = config.tts.voice || '';
}
synth?.addEventListener?.('voiceschanged', loadVoices);
function renderTts() {
  const t = config.tts;
  $('#ttsEnabled').checked = t.enabled;
  $('#ttsMode').value = t.mode;
  $('#ttsPrefix').value = t.prefix;
  $('#ttsMax').value = t.maxLength;
  $('#ttsRate').value = t.rate;
  $('#ttsRateVal').textContent = `${t.rate}×`;
  loadVoices();
}
$('#ttsRate').addEventListener('input', (e) => { $('#ttsRateVal').textContent = `${e.target.value}×`; });
function say(text) {
  if (!synth) return;
  const u = new SpeechSynthesisUtterance(text);
  const v = synth.getVoices().find((x) => x.name === $('#ttsVoice').value);
  if (v) u.voice = v;
  u.rate = Number($('#ttsRate').value) || 1;
  synth.speak(u);
}
$('#ttsTest').addEventListener('click', () => say('test viewer says hello, this is what text to speech sounds like.'));
$('#saveTts').addEventListener('click', (e) => saveConfig({ tts: {
  enabled: $('#ttsEnabled').checked, mode: $('#ttsMode').value, prefix: $('#ttsPrefix').value || '!tts',
  maxLength: Number($('#ttsMax').value) || 150, voice: $('#ttsVoice').value, rate: Number($('#ttsRate').value) || 1
} }, 'Text-to-speech saved', e.currentTarget));
socket.on('tts', ({ text }) => { if (playHere()) say(text); });

// ── subathon timer ───────────────────────────────────────
let timer = { running: false, remaining: 0, endsAt: 0 };
socket.on('timer', (t) => { timer = t; drawClock(); });
function drawClock() {
  const ms = timer.running ? Math.max(0, timer.endsAt - Date.now()) : timer.remaining;
  const s = Math.ceil(ms / 1000);
  $('#clock').textContent = `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  $('#clock').classList.toggle('paused', !timer.running);
  $('#timerToggle').textContent = timer.running ? 'Pause' : 'Start';
}
setInterval(drawClock, 500);
$('#timerToggle').addEventListener('click', () => api('POST', '/api/timer', { action: timer.running ? 'pause' : 'start' }));
$('#timerReset').addEventListener('click', () => { if (confirm('Reset the timer to its starting time?')) api('POST', '/api/timer', { action: 'reset' }); });
document.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', () => api('POST', '/api/timer', { action: 'add', seconds: Number(b.dataset.add) })));
const TIMER_FIELDS = [['startMinutes', 'Start at (minutes)'], ['perCoin', 'Per coin'], ['perFollow', 'Per follow'], ['perShare', 'Per share'], ['perSub', 'Per subscribe'], ['per100Likes', 'Per 100 likes']];
function renderTimerForm() {
  $('#timerForm').replaceChildren(...TIMER_FIELDS.map(([k, label]) =>
    field(label, bind(config.timer, k, el('input', { type: 'number', min: 0 }), Number, () => markUnsaved($('#saveTimer'))))));
}
$('#saveTimer').addEventListener('click', (e) => saveConfig({ timer: config.timer }, 'Timer saved', e.currentTarget));

// ── goals ────────────────────────────────────────────────
function renderGoals() {
  const dirty = () => markUnsaved($('#saveGoals'));
  $('#goals').replaceChildren(...Object.entries(config.goals).map(([k, g]) => {
    const on = el('input', { type: 'checkbox', checked: g.enabled });
    on.addEventListener('change', () => { g.enabled = on.checked; dirty(); });
    return el('div', { class: 'row', style: 'margin-bottom:10px;flex-wrap:nowrap' },
      on,
      el('div', { class: 'grow' }, bind(g, 'label', el('input', { title: `${k} goal label` }), null, dirty)),
      el('div', { style: 'width:110px' }, bind(g, 'target', el('input', { type: 'number', min: 1, title: 'Target' }), (v) => Number(v) || 1, dirty)),
      el('span', { class: 'faint mono', style: 'width:52px' }, k));
  }));
}
$('#saveGoals').addEventListener('click', async (e) => { if (await saveConfig({ goals: config.goals }, 'Goals saved', e.currentTarget)) { drawGoalMini(); renderOverlays(); } });

// ── overlays ─────────────────────────────────────────────
function renderOverlays() {
  const goalCards = Object.entries(config.goals).map(([k, g]) => [`Goal: ${g.label}`, `Bar toward ${fmt(g.target)} ${k}.`, `/overlays/goal.html?goal=${k}`]);
  const groups = [
    ['Alerts & sound', [
      ['Alerts', 'Pop-up alerts. Also plays sound actions and TTS.', '/overlays/alerts.html', { pv: 'tts=0&volume=0', idle: 'Press Test on an alert' }],
      ['Sound player', 'Only plays sounds and TTS (invisible). Use instead of Alerts, not together.', '/overlays/sounds.html', { idle: 'Nothing to see, audio only' }]
    ]],
    ['Chat & gifts', [
      ['Chat', 'Chat with gifts, follows and shares mixed in.', '/overlays/chat.html', { idle: 'Waiting for chat' }],
      ['Gift combos', 'Combo counter that ticks up x1, x2, x3 while gifts stream in.', '/overlays/combos.html', { idle: 'Send a test gift' }],
      ['Like hearts', 'Hearts float up when people tap likes.', '/overlays/hearts.html', { idle: 'Send test likes' }],
      ['Ticker', 'Latest follower, gift and share.', '/overlays/ticker.html']
    ]],
    ['Leaderboards & counters', [
      ['Top gifters', 'Biggest supporters this stream.', '/overlays/gifters.html'],
      ['Top likers', 'Who tapped the most.', '/overlays/gifters.html?by=likes'],
      ['Like counter', 'One big number. Change ?stat= for viewers, coins, follows …', '/overlays/counter.html?stat=likes'],
      ['Viewer counter', 'Current viewers.', '/overlays/counter.html?stat=viewers']
    ]],
    ['Goals & timer', [
      ['Subathon timer', 'Countdown that grows with gifts, follows and likes.', '/overlays/timer.html'],
      ...goalCards
    ]]
  ];
  const base = location.origin;
  $('#overlays').replaceChildren(...groups.flatMap(([title, items]) => [
    el('div', { class: 'ov-group' }, title),
    el('div', { class: 'ovs' }, items.map(([name, desc, p, opt = {}]) => {
      const url = base + p;
      const src = opt.pv ? `${p}${p.includes('?') ? '&' : '?'}${opt.pv}` : p;
      return el('div', { class: 'panel ov' },
        el('div', { class: 'pv' }, opt.idle ? el('span', { class: 'idle' }, opt.idle) : null, el('iframe', { src, loading: 'lazy', title: name, tabIndex: -1 })),
        el('div', { class: 'info' }, el('h3', {}, name), el('p', {}, desc),
          el('div', { class: 'url' },
            el('input', { value: url, readOnly: true, onfocus: (e) => e.target.select() }),
            el('button', { class: 'btn sq', title: 'Copy', onclick: () => navigator.clipboard.writeText(url).then(() => toast('Copied')) }, icon('copy')),
            el('button', { class: 'btn sq', title: 'Open', onclick: () => window.open(url, '_blank') }, icon('external')))));
    }))
  ]));
}

// ── settings ─────────────────────────────────────────────
function renderSettings() {
  $('#autoReconnect').checked = config.autoReconnect;
  $('#keyState').textContent = config.hasSignApiKey ? 'A key is saved.' : 'No key saved.';
}
$('#saveSettings').addEventListener('click', async () => {
  const body = { autoReconnect: $('#autoReconnect').checked };
  const key = $('#signApiKey').value.trim();
  if (key) body.signApiKey = key;
  if (await saveConfig(body, 'Settings saved')) { $('#signApiKey').value = ''; renderSettings(); }
});

// ── gifts ────────────────────────────────────────────────
async function loadGifts() {
  gifts = await api('GET', '/api/gifts').catch(() => []);
  $('#giftList').replaceChildren(...gifts.map((g) => el('option', { value: g.name }, `${fmt(g.diamonds)} coins`)));
  $('#simGift').replaceChildren(el('option', { value: '' }, 'Random gift'),
    ...gifts.slice(0, 60).map((g) => el('option', { value: g.name }, `${g.name} (${fmt(g.diamonds)})`)));
}

// ── boot ─────────────────────────────────────────────────
(async function init() {
  [config] = await Promise.all([api('GET', '/api/config'), loadSounds(), loadGifts()]);
  $('#username').value = config.username || '';
  $('#master').value = config.sounds.volume;
  $('#masterVal').textContent = `${Math.round(config.sounds.volume * 100)}%`;
  $('#maxAtOnce').value = config.sounds.maxAtOnce;
  $('#playHere').checked = playHere();
  renderRules();
  renderSoundRules();
  renderTts();
  renderTimerForm();
  renderGoals();
  drawGoalMini();
  renderOverlays();
  renderSettings();
})();
