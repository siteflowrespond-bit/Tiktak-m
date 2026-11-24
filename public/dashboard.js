/* global io */
const $ = (sel) => document.querySelector(sel);
const socket = io();
let config = null;

// ───────── helpers ─────────
async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

function toast(msg, isError = false) {
  const t = el('div', { class: `toast${isError ? ' err' : ''}` }, el('span', { class: 'd' }), msg);
  $('#toasts').append(t);
  setTimeout(() => t.remove(), 3200);
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
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return node;
}

function icon(name, style, extraClass = '') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', `i ${extraClass}`.trim());
  if (style) svg.setAttribute('style', style);
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.append(use);
  return svg;
}

const AVATAR_COLORS = ['#ff3b6b', '#8b7cff', '#2de2e6', '#ffc53d', '#36d399', '#ff9f43', '#e879f9', '#60a5fa'];
function avatar(user, small = false) {
  const cls = `avatar${small ? ' sm' : ''}`;
  if (user?.avatar) return el('img', { class: cls, src: user.avatar, alt: '', referrerPolicy: 'no-referrer' });
  const name = user?.nickname || '?';
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return el('span', { class: cls, style: `background:${AVATAR_COLORS[h % AVATAR_COLORS.length]}` }, name.charAt(0).toUpperCase());
}

const fmt = (n) => Number(n || 0).toLocaleString();
const time = (ts) => new Date(ts || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const EVENTS = {
  chat: { label: 'Chat', icon: 'chat', color: 'var(--violet)' },
  gift: { label: 'Gift', icon: 'gift', color: 'var(--gold)' },
  follow: { label: 'Follow', icon: 'follow', color: 'var(--pink)' },
  share: { label: 'Share', icon: 'share', color: 'var(--cyan)' },
  like: { label: 'Likes', icon: 'heart', color: '#ff6b9d' },
  join: { label: 'Join', icon: 'join', color: 'var(--green)' },
  subscribe: { label: 'Super fan', icon: 'star', color: 'var(--orange)' },
  command: { label: 'Command', icon: 'command', color: 'var(--violet)' }
};

// ───────── navigation ─────────
const PAGES = {
  live: ['Live', 'Real-time activity from your stream'],
  actions: ['Actions', 'Make alerts, sounds and speech react to your viewers'],
  goals: ['Goals & TTS', 'Progress bars and chat text-to-speech'],
  overlays: ['Overlays', 'Add these to TikTok LIVE Studio or OBS'],
  settings: ['Settings', 'Connection options']
};
function showPage(page) {
  if (!PAGES[page]) page = 'live';
  document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('active', b.dataset.page === page));
  document.querySelectorAll('.page').forEach((s) => s.classList.toggle('active', s.id === `page-${page}`));
  [$('#pageTitle').textContent, $('#pageSub').textContent] = PAGES[page];
  try { localStorage.setItem('page', page); } catch {}
}
$('#nav').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) showPage(b.dataset.page); });
try { showPage(localStorage.getItem('page') || 'live'); } catch { showPage('live'); }

// ───────── connection ─────────
let status = 'disconnected';
let connectedAt = 0;
$('#connectForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#connectBtn');
  if (status === 'connected' || status === 'connecting' || status === 'error') {
    await api('POST', '/api/disconnect').catch(() => {});
    return;
  }
  btn.disabled = true;
  try {
    await api('POST', '/api/connect', { username: $('#username').value.trim() });
    toast('Connected to the LIVE');
  } catch (err) {
    toast(err.message, true);
  } finally {
    btn.disabled = false;
  }
});

socket.on('status', ({ status: s, username, detail }) => {
  status = s;
  if (s === 'connected' && !connectedAt) connectedAt = Date.now();
  if (s !== 'connected') connectedAt = 0;
  $('#statusPill').className = `pill ${s}`;
  const text = { connected: 'LIVE', connecting: 'Connecting…', disconnected: 'Offline', error: 'Not connected' }[s] || s;
  $('#statusText').textContent = text;
  $('#statusPill').title = [username && `@${username}`, detail].filter(Boolean).join(' · ');
  const btn = $('#connectBtn');
  const active = s !== 'disconnected';
  btn.textContent = active ? 'Disconnect' : 'Connect';
  btn.classList.toggle('primary', !active);
  $('#username').disabled = active;
  tickUptime();
});
function tickUptime() {
  if (status !== 'connected' || !connectedAt) return;
  const s = Math.floor((Date.now() - connectedAt) / 1000);
  const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
  $('#statusText').textContent = `LIVE · ${hh ? `${hh}:` : ''}${String(mm).padStart(hh ? 2 : 1, '0')}:${String(ss).padStart(2, '0')}`;
}
setInterval(tickUptime, 1000);

// ───────── stats ─────────
const TILES = [
  ['viewers', 'Viewers', 'eye', 'var(--cyan)'],
  ['likes', 'Likes', 'heart', '#ff6b9d'],
  ['coins', 'Coins', 'coin', 'var(--gold)'],
  ['follows', 'New followers', 'follow', 'var(--pink)'],
  ['shares', 'Shares', 'share', 'var(--violet)'],
  ['comments', 'Comments', 'chat', 'var(--green)']
];
$('#tiles').append(...TILES.map(([key, label, ic, c]) =>
  el('div', { class: 'tile', id: `t-${key}`, style: `--c:${c}` },
    el('div', { class: 'ico' }, icon(ic)),
    el('div', { class: 'label' }, label),
    el('div', { class: 'value' }, '0'))));

let lastStats = {};
socket.on('stats', (s) => {
  for (const [key] of TILES) {
    const tile = $(`#t-${key}`);
    tile.querySelector('.value').textContent = fmt(s[key]);
    if (lastStats[key] !== undefined && s[key] > lastStats[key]) {
      tile.classList.remove('bump'); void tile.offsetWidth; tile.classList.add('bump');
    }
  }
  lastStats = s;
  renderGifters(s.topGifters || []);
  renderGoalMini();
});

function renderGifters(list) {
  const rows = list.slice(0, 5).map((g, i) => el('div', { class: 'row' },
    el('span', { class: 'rank' }, i + 1), avatar(g.user, true),
    el('span', { class: 'name' }, g.user.nickname),
    el('span', { class: 'coins' }, fmt(g.coins))));
  $('#gifters').replaceChildren(...(rows.length ? rows : [el('div', { class: 'empty' }, 'No gifts yet. The first gifter shows up here.')]));
}

function renderGoalMini() {
  if (!config) return;
  const goals = Object.entries(config.goals).filter(([, g]) => g.enabled);
  $('#goalMini').replaceChildren(...(goals.length ? goals.map(([k, g]) => {
    const v = lastStats[k] || 0;
    const pct = Math.min(100, (v / (g.target || 1)) * 100);
    return el('div', {},
      el('div', { class: 'top' }, el('span', {}, g.label), el('span', {}, `${fmt(v)} / ${fmt(g.target)}`)),
      el('div', { class: 'bar' }, el('i', { style: `width:${pct}%` })));
  }) : [el('div', { class: 'empty' }, 'No goals enabled.')]));
}
$('#resetStats').addEventListener('click', () => api('POST', '/api/reset-stats').then(() => toast('Stats reset')));

// ───────── activity feed ─────────
const feed = $('#feed');
const FILTERS = ['chat', 'gift', 'follow', 'share', 'like', 'join', 'subscribe'];
const filterDefaults = { like: false, join: false };
$('#feedFilters').append(...FILTERS.map((t) => el('label', { class: 'chip', style: `--c:${EVENTS[t].color}` },
  el('input', { type: 'checkbox', value: t, checked: filterDefaults[t] !== false }),
  el('span', { class: 'sw' }), EVENTS[t].label)));
const shown = () => new Set([...document.querySelectorAll('#feedFilters input:checked')].map((i) => i.value));

function describe(evt) {
  switch (evt.type) {
    case 'chat': return evt.comment;
    case 'gift': return [`sent ${evt.gift.count > 1 ? `${evt.gift.count}× ` : ''}${evt.gift.name} · `, el('span', { class: 'coins' }, `${fmt(evt.gift.coins)} coins`)];
    case 'like': return `sent ${evt.likes} likes`;
    case 'follow': return 'started following you';
    case 'share': return 'shared your LIVE';
    case 'join': return 'joined the LIVE';
    case 'subscribe': return 'became a super fan';
    default: return evt.type;
  }
}

socket.on('event', (evt) => {
  if (evt.type === 'giftStreak') return;
  if (evt.type === 'streamEnd') { toast('The LIVE has ended'); return; }
  if (!shown().has(evt.type)) return;
  $('#feedEmpty')?.remove();
  const meta = EVENTS[evt.type] || { label: evt.type, color: 'var(--muted)' };
  const item = el('div', { class: `ev ${evt.type}`, style: `--c:${meta.color}` },
    avatar(evt.user),
    el('div', { class: 'meta' },
      el('div', { class: 'who' }, evt.user?.nickname || '', el('span', { class: 'tag' }, meta.label)),
      el('div', { class: 'what' }, describe(evt))),
    evt.gift?.image ? el('img', { class: 'gift-img', src: evt.gift.image, alt: '', referrerPolicy: 'no-referrer' }) : el('span', { class: 'time' }, time(evt.ts)));
  const atBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 60;
  feed.append(item);
  while (feed.children.length > 300) feed.firstChild.remove();
  if (atBottom) feed.scrollTop = feed.scrollHeight;
});
$('#clearFeed').addEventListener('click', () => feed.replaceChildren());

// ───────── simulator ─────────
const SIMS = [['follow', 'Follow'], ['share', 'Share'], ['like', 'Likes'], ['chat', 'Chat'], ['join', 'Join'], ['subscribe', 'Super fan']];
$('#simGrid').append(...SIMS.map(([t, label]) =>
  el('button', { class: 'btn', 'data-sim': t, style: `--c:${EVENTS[t].color}` }, icon(EVENTS[t].icon), label)));
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
  if (!comment) return;
  api('POST', '/api/simulate', { type: 'chat', comment });
  $('#simChat').value = '';
});

// ───────── actions (rules) ─────────
const TRIGGERS = ['gift', 'follow', 'share', 'like', 'command', 'chat', 'join', 'subscribe'];
const TRIGGER_LABELS = {
  gift: 'A gift is sent', follow: 'Someone follows', share: 'Someone shares the LIVE', like: 'Someone sends likes',
  command: 'A chat command is used', chat: 'A chat message contains…', join: 'A viewer joins', subscribe: 'Someone becomes a super fan'
};
const PLACEHOLDERS = ['nickname', 'username', 'avatar', 'giftName', 'giftImage', 'count', 'coins', 'comment', 'likes'];
const openRules = new Set();
let dirty = false;
function setDirty(v = true) { dirty = v; $('#saveRules').classList.toggle('dirty', v); }
window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

function triggerSummary(t) {
  switch (t.type) {
    case 'gift': {
      const parts = [t.giftName ? t.giftName : 'Any gift'];
      const min = Number(t.minCoins) || 0, max = Number(t.maxCoins) || 0;
      if (min && max) parts.push(`${fmt(min)}–${fmt(max)} coins`);
      else if (min > 1) parts.push(`${fmt(min)}+ coins`);
      else if (max) parts.push(`up to ${fmt(max)} coins`);
      return parts;
    }
    case 'command': return [t.command || 'no command set'];
    case 'chat': return [t.keyword ? `contains “${t.keyword}”` : 'any message'];
    case 'like': return [`${t.minLikes || 1}+ likes`];
    default: return [EVENTS[t.type]?.label || t.type];
  }
}

function renderRules() {
  const wrap = $('#rules');
  $('#ruleCount').textContent = `${config.rules.filter((r) => r.enabled).length} of ${config.rules.length} actions on`;
  if (!config.rules.length) {
    wrap.replaceChildren(el('div', { class: 'card' }, el('div', { class: 'card-body feed-empty', style: 'padding:40px' },
      icon('zap'), el('div', {}, el('b', {}, 'No actions yet')), el('div', {}, 'Create one to react to gifts, follows and chat commands.'))));
    return;
  }
  wrap.replaceChildren(...config.rules.map((rule, idx) => renderRule(rule, idx)));
}

function field(label, input, cls = '') { return el('div', { class: `field ${cls}` }, el('label', {}, label), input); }

function renderRule(rule, idx) {
  rule.alert ||= { text: '', image: '', sound: '', duration: 4 };
  const t = rule.trigger;
  const meta = EVENTS[t.type === 'command' ? 'command' : t.type] || EVENTS.chat;
  const bind = (obj, key, input, cast = (v) => v, rerender = false) => {
    input.value = obj[key] ?? '';
    input.addEventListener('input', () => { obj[key] = cast(input.value); setDirty(); if (rerender) refreshHead(); });
    return input;
  };

  const enabled = el('input', { type: 'checkbox', checked: rule.enabled });
  enabled.addEventListener('change', () => { rule.enabled = enabled.checked; setDirty(); renderRules(); });

  const head = el('div', { class: 'rule-head' });
  const card = el('div', { class: `rule${openRules.has(rule.id) ? ' open' : ''}${rule.enabled ? '' : ' off'}` });

  function refreshHead() {
    const actions = [];
    if (rule.alert?.text) actions.push('Alert');
    if (rule.alert?.sound) actions.push('Sound');
    if (rule.tts) actions.push('Speech');
    head.replaceChildren(
      el('label', { class: 'switch', onclick: (e) => e.stopPropagation() }, enabled, el('span', { class: 'track' })),
      el('div', { class: 'rule-ico', style: `--c:${meta.color}` }, icon(meta.icon)),
      el('div', { class: 'rule-title' },
        el('div', { class: 'name' }, rule.name || 'Untitled action'),
        el('div', { class: 'summary' },
          triggerSummary(t).map((s) => el('span', { class: 'tag-s' }, s)),
          actions.length ? actions.map((a) => el('span', { class: 'tag-s act' }, a)) : el('span', { class: 'tag-s' }, 'no output'),
          Number(rule.cooldown) ? el('span', { class: 'tag-s' }, `${rule.cooldown}s cooldown`) : null)),
      el('div', { class: 'rule-actions', onclick: (e) => e.stopPropagation() },
        el('button', { class: 'btn sm', title: 'Send a test to the overlays', onclick: () => testRule(rule) }, icon('play'), 'Test'),
        el('button', { class: 'btn ghost icon danger', title: 'Delete', onclick: () => {
          if (!confirm(`Delete “${rule.name}”?`)) return;
          config.rules.splice(idx, 1); setDirty(); renderRules();
        } }, icon('trash'))),
      icon('chev', null, 'chev'));
  }
  refreshHead();
  head.addEventListener('click', () => {
    card.classList.toggle('open');
    if (card.classList.contains('open')) openRules.add(rule.id); else openRules.delete(rule.id);
  });

  const typeSel = el('select', {}, TRIGGERS.map((v) => el('option', { value: v }, TRIGGER_LABELS[v])));
  typeSel.value = t.type;
  typeSel.addEventListener('change', () => { rule.trigger = { type: typeSel.value }; setDirty(); renderRules(); });

  const triggerFields = [field('When', typeSel, 'wide')];
  if (t.type === 'gift') {
    triggerFields.push(
      field('Gift name (blank = any)', bind(t, 'giftName', el('input', { list: 'giftList', placeholder: 'e.g. Rose' }), String, true)),
      field('Min coins', bind(t, 'minCoins', el('input', { type: 'number', min: 0, placeholder: '0' }), Number, true)),
      field('Max coins', bind(t, 'maxCoins', el('input', { type: 'number', min: 0, placeholder: 'no limit' }), (v) => (v === '' ? '' : Number(v)), true)));
  } else if (t.type === 'command') {
    triggerFields.push(field('Command', bind(t, 'command', el('input', { placeholder: '!hello' }), String, true)));
  } else if (t.type === 'chat') {
    triggerFields.push(field('Keyword (blank = any)', bind(t, 'keyword', el('input'), String, true)));
  } else if (t.type === 'like') {
    triggerFields.push(field('Min likes in one burst', bind(t, 'minLikes', el('input', { type: 'number', min: 1 }), Number, true)));
  }
  triggerFields.push(field('Cooldown (seconds)', bind(rule, 'cooldown', el('input', { type: 'number', min: 0 }), Number, true)));

  const body = el('div', { class: 'rule-body' },
    el('div', { class: 'section-label' }, 'Name'),
    el('div', { class: 'fields' }, field('Action name', bind(rule, 'name', el('input'), String, true), 'wide')),
    el('div', { class: 'section-label' }, 'Trigger'),
    el('div', { class: 'fields' }, triggerFields),
    el('div', { class: 'section-label' }, 'Then'),
    el('div', { class: 'fields' },
      field('Alert text', bind(rule.alert, 'text', el('input', { placeholder: 'Leave empty for no alert' }), String, true), 'wide'),
      field('Image or GIF URL', bind(rule.alert, 'image', el('input', { placeholder: '{avatar} or https://…' }))),
      field('Duration (seconds)', bind(rule.alert, 'duration', el('input', { type: 'number', min: 1 }), Number))),
    el('div', { class: 'fields' },
      field('Sound URL', bind(rule.alert, 'sound', el('input', { placeholder: '/sounds/ding.mp3' }), String, true), 'wide'),
      field('Say out loud (TTS)', bind(rule, 'tts', el('input', { placeholder: 'Thank you {nickname}!' }), String, true), 'wide')),
    el('div', { class: 'section-label' }, 'Placeholders (click to copy)'),
    el('div', { class: 'placeholders' }, PLACEHOLDERS.map((p) => el('code', {
      onclick: () => navigator.clipboard?.writeText(`{${p}}`).then(() => toast(`Copied {${p}}`))
    }, `{${p}}`))));

  card.append(head, body);
  return card;
}

function testRule(rule) {
  const sample = { nickname: 'Test User', username: 'test_user', avatar: '', giftName: rule.trigger.giftName || 'Rose', giftImage: '', count: 5, coins: 5, comment: rule.trigger.command || 'hello', likes: 10 };
  const fill = (s) => String(s || '').replace(/\{(\w+)\}/g, (m, k) => (k in sample ? sample[k] : m));
  api('POST', '/api/test-alert', {
    text: fill(rule.alert?.text), image: fill(rule.alert?.image), sound: rule.alert?.sound, duration: rule.alert?.duration, tts: fill(rule.tts)
  }).then(() => toast('Test sent to overlays'));
}

$('#addRule').addEventListener('click', () => {
  const id = `rule-${Date.now()}`;
  config.rules.unshift({
    id, enabled: true, name: 'New action',
    trigger: { type: 'gift', giftName: '', minCoins: 1, maxCoins: '' },
    alert: { text: '{nickname} sent {giftName}!', image: '{giftImage}', sound: '', duration: 4 },
    tts: '', cooldown: 0
  });
  openRules.add(id);
  setDirty();
  renderRules();
});

async function saveConfig(partial, msg = 'Saved') {
  try {
    const saved = await api('PUT', '/api/config', partial);
    config = { ...config, ...saved };
    toast(msg);
    return true;
  } catch (e) { toast(e.message, true); return false; }
}
$('#saveRules').addEventListener('click', async () => { if (await saveConfig({ rules: config.rules }, 'Actions saved')) setDirty(false); });

// ───────── goals ─────────
function renderGoals() {
  $('#goals').replaceChildren(...Object.entries(config.goals).map(([key, g]) => {
    const en = el('input', { type: 'checkbox', checked: g.enabled });
    en.addEventListener('change', () => { g.enabled = en.checked; });
    const label = el('input', { value: g.label });
    label.addEventListener('input', () => { g.label = label.value; });
    const target = el('input', { type: 'number', min: 1, value: g.target });
    target.addEventListener('input', () => { g.target = Number(target.value) || 1; });
    return el('div', { class: 'goal-row' },
      el('label', { class: 'switch' }, en, el('span', { class: 'track' })),
      field(`${key[0].toUpperCase()}${key.slice(1)} · label`, label),
      field('Target', target));
  }));
}
$('#saveGoals').addEventListener('click', () => saveConfig({ goals: config.goals }, 'Goals saved').then(() => { renderGoalMini(); renderOverlays(); }));

// ───────── TTS ─────────
const synth = window.speechSynthesis;
function loadVoices() {
  if (!synth || !config) return;
  const sel = $('#ttsVoice');
  sel.replaceChildren(el('option', { value: '' }, 'System default'),
    ...synth.getVoices().map((v) => el('option', { value: v.name }, `${v.name} (${v.lang})`)));
  sel.value = config.tts.voice || '';
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
  try { $('#ttsLocal').checked = localStorage.getItem('ttsLocal') === '1'; } catch {}
  loadVoices();
}
$('#ttsRate').addEventListener('input', (e) => { $('#ttsRateVal').textContent = `${e.target.value}×`; });
$('#ttsLocal').addEventListener('change', (e) => { try { localStorage.setItem('ttsLocal', e.target.checked ? '1' : '0'); } catch {} });
$('#saveTts').addEventListener('click', () => saveConfig({
  tts: {
    enabled: $('#ttsEnabled').checked, mode: $('#ttsMode').value, prefix: $('#ttsPrefix').value || '!tts',
    maxLength: Number($('#ttsMax').value) || 150, voice: $('#ttsVoice').value, rate: Number($('#ttsRate').value) || 1
  }
}, 'Text-to-speech saved'));

function speakLocal(text) {
  if (!synth) return;
  const u = new SpeechSynthesisUtterance(text);
  const voice = synth.getVoices().find((v) => v.name === $('#ttsVoice').value);
  if (voice) u.voice = voice;
  u.rate = Number($('#ttsRate').value) || 1;
  synth.speak(u);
}
$('#ttsTest').addEventListener('click', () => speakLocal('Hello! This is how Tiktak sounds on your stream.'));
socket.on('tts', ({ text }) => {
  let local = false;
  try { local = localStorage.getItem('ttsLocal') === '1'; } catch {}
  if (local) speakLocal(text);
});

// ───────── overlays ─────────
function renderOverlays() {
  const base = location.origin;
  const list = [
    ['Alerts', 'Pop-up alerts with sounds and text-to-speech.', '/overlays/alerts.html', '?tts=0&volume=0', 'Alerts appear here. Press Test on an action.'],
    ['Chat box', 'Live chat plus gifts, follows and shares.', '/overlays/chat.html', '', 'New chat messages appear here.'],
    ['Top gifters', 'Leaderboard of the biggest supporters.', '/overlays/gifters.html', ''],
    ['Ticker', 'Latest follower, gift and share.', '/overlays/ticker.html', ''],
    ...Object.entries(config.goals).map(([k, g]) => [`Goal · ${g.label}`, `Progress bar toward ${fmt(g.target)} ${k}.`, `/overlays/goal.html?goal=${k}`, ''])
  ];
  $('#overlayGrid').replaceChildren(...list.map(([title, desc, p, previewParams, idle]) => {
    const url = base + p;
    const preview = p + (previewParams ? (p.includes('?') ? `&${previewParams.slice(1)}` : previewParams) : '');
    const input = el('input', { value: url, readOnly: true, onfocus: (e) => e.target.select() });
    return el('div', { class: 'card ov' },
      el('div', { class: 'ov-preview' }, idle ? el('div', { class: 'ov-hint' }, idle) : null, el('iframe', { src: preview, loading: 'lazy', title: `${title} preview`, tabIndex: -1 })),
      el('div', { class: 'ov-info' },
        el('h3', {}, title), el('p', {}, desc),
        el('div', { class: 'url' }, input,
          el('button', { class: 'btn icon', title: 'Copy URL', onclick: () => navigator.clipboard.writeText(url).then(() => toast('Overlay URL copied')) }, icon('copy')),
          el('button', { class: 'btn icon', title: 'Open in a new tab', onclick: () => window.open(url, '_blank') }, icon('external')))));
  }));
}

// ───────── settings ─────────
function renderSettings() {
  $('#autoReconnect').checked = config.autoReconnect;
  $('#keyState').textContent = config.hasSignApiKey ? '✓ An API key is saved.' : 'No API key saved.';
}
$('#saveSettings').addEventListener('click', async () => {
  const body = { autoReconnect: $('#autoReconnect').checked };
  const key = $('#signApiKey').value.trim();
  if (key) body.signApiKey = key;
  if (await saveConfig(body, 'Settings saved')) { $('#signApiKey').value = ''; renderSettings(); }
});

// ───────── boot ─────────
(async function init() {
  config = await api('GET', '/api/config');
  $('#username').value = config.username || '';
  $('#simGift').append(...config.simGifts.map((g) => el('option', { value: g }, g)));
  document.body.append(el('datalist', { id: 'giftList' }, config.simGifts.map((g) => el('option', { value: g }))));
  renderRules();
  renderGoals();
  renderGoalMini();
  renderTts();
  renderOverlays();
  renderSettings();
  renderGifters([]);
})();
