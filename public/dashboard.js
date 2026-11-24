/* global io */
const $ = (sel) => document.querySelector(sel);
const socket = io();
let config = null;

// ---------- helpers ----------
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

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 2500);
}

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k in node) node[k] = v;
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return node;
}

function avatar(user) {
  if (user?.avatar) return el('img', { class: 'avatar', src: user.avatar, alt: '', referrerPolicy: 'no-referrer' });
  return el('span', { class: 'avatar' }, (user?.nickname || '?').charAt(0).toUpperCase());
}

const fmt = (n) => Number(n || 0).toLocaleString();

// ---------- tabs ----------
$('#tabs').addEventListener('click', (e) => {
  const tab = e.target.dataset.tab;
  if (!tab) return;
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab').forEach((s) => s.classList.toggle('active', s.id === `tab-${tab}`));
  localStorage.setItem('tab', tab);
});
try { const t = localStorage.getItem('tab'); if (t) document.querySelector(`#tabs [data-tab="${t}"]`)?.click(); } catch {}

// ---------- connection ----------
$('#connectForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = $('#username').value.trim();
  $('#connectBtn').disabled = true;
  try {
    await api('POST', '/api/connect', { username });
    toast('Connected!');
  } catch (err) {
    toast(err.message);
  } finally {
    $('#connectBtn').disabled = false;
  }
});
$('#disconnectBtn').addEventListener('click', () => api('POST', '/api/disconnect'));

socket.on('status', ({ status, username, detail }) => {
  $('#statusDot').className = `dot ${status}`;
  const who = username ? ` @${username}` : '';
  const labels = { connected: 'Connected to', connecting: 'Connecting to', disconnected: 'Disconnected', error: 'Error' };
  $('#statusText').textContent = `${labels[status] || status}${status === 'disconnected' ? '' : who}${detail ? ` · ${detail}` : ''}`;
});

// ---------- stats ----------
socket.on('stats', (s) => {
  for (const k of ['viewers', 'likes', 'coins', 'follows', 'shares', 'comments']) $(`#s-${k}`).textContent = fmt(s[k]);
  const body = $('#gifters');
  body.replaceChildren(...(s.topGifters || []).map((g, i) =>
    el('tr', {}, el('td', {}, i + 1), el('td', {}, el('span', { class: 'row' }, avatar(g.user), g.user.nickname)), el('td', {}, fmt(g.coins)))
  ));
  if (!s.topGifters?.length) body.append(el('tr', {}, el('td', { colSpan: 3, class: 'muted' }, 'No gifts yet')));
});
$('#resetStats').addEventListener('click', () => api('POST', '/api/reset-stats'));

// ---------- feed ----------
const feed = $('#feed');
const shown = () => new Set([...document.querySelectorAll('#feedFilters input:checked')].map((i) => i.value));

function describe(evt) {
  switch (evt.type) {
    case 'chat': return evt.comment;
    case 'gift': return `sent ${evt.gift.count}x ${evt.gift.name} (${fmt(evt.gift.coins)} coins)`;
    case 'like': return `liked ${evt.likes}x`;
    case 'follow': return 'followed';
    case 'share': return 'shared the LIVE';
    case 'join': return 'joined';
    case 'subscribe': return 'became a super fan';
    case 'streamEnd': return 'The LIVE has ended';
    default: return evt.type;
  }
}

socket.on('event', (evt) => {
  if (evt.type === 'giftStreak') return;
  if (evt.type !== 'streamEnd' && !shown().has(evt.type)) return;
  const item = el('div', { class: 'item' },
    avatar(evt.user),
    el('span', { class: `badge ${evt.type}` }, evt.type),
    el('span', { class: 'who' }, evt.user?.nickname || ''),
    el('span', { class: 'what' }, describe(evt))
  );
  const atBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 40;
  feed.append(item);
  while (feed.children.length > 300) feed.firstChild.remove();
  if (atBottom) feed.scrollTop = feed.scrollHeight;
});
$('#clearFeed').addEventListener('click', () => feed.replaceChildren());

// ---------- simulator ----------
document.querySelectorAll('[data-sim]').forEach((b) => b.addEventListener('click', () => {
  const body = { type: b.dataset.sim };
  if (body.type === 'gift') body.giftName = $('#simGift').value;
  api('POST', '/api/simulate', body).catch((e) => toast(e.message));
}));
$('#simChatBtn').addEventListener('click', () => {
  const comment = $('#simChat').value.trim();
  if (comment) api('POST', '/api/simulate', { type: 'chat', comment });
});

// ---------- rules ----------
const TRIGGERS = {
  gift: 'Gift received',
  follow: 'New follower',
  share: 'Stream shared',
  like: 'Likes',
  command: 'Chat command',
  chat: 'Chat message (keyword)',
  join: 'Viewer joined',
  subscribe: 'Super fan / subscribe'
};

function field(label, input) {
  return el('div', { class: 'field' }, el('label', {}, label), input);
}

function renderRules() {
  const wrap = $('#rules');
  wrap.replaceChildren();
  config.rules.forEach((rule, idx) => wrap.append(renderRule(rule, idx)));
  if (!config.rules.length) wrap.append(el('p', { class: 'muted' }, 'No rules yet. Click “Add rule”.'));
}

function renderRule(rule, idx) {
  const bind = (obj, key, input, cast = (v) => v) => {
    input.value = obj[key] ?? '';
    input.addEventListener('input', () => { obj[key] = cast(input.value); });
    return input;
  };
  rule.alert ||= { text: '', image: '', sound: '', duration: 4 };
  const t = rule.trigger;

  const typeSel = el('select', {}, Object.entries(TRIGGERS).map(([v, l]) => el('option', { value: v }, l)));
  typeSel.value = t.type;
  typeSel.addEventListener('change', () => { rule.trigger = { type: typeSel.value }; renderRules(); });

  const extra = [];
  if (t.type === 'gift') {
    const giftList = el('datalist', { id: `gifts-${idx}` }, (config.simGifts || []).map((g) => el('option', { value: g })));
    extra.push(field('Gift name (blank = any)', bind(t, 'giftName', el('input', { list: `gifts-${idx}`, placeholder: 'e.g. Rose' }))), giftList);
    extra.push(field('Min coins (gift × count)', bind(t, 'minCoins', el('input', { type: 'number', min: 0 }), Number)));
    extra.push(field('Max coins (blank = no limit)', bind(t, 'maxCoins', el('input', { type: 'number', min: 0 }), (v) => (v === '' ? '' : Number(v)))));
  } else if (t.type === 'command') {
    extra.push(field('Command', bind(t, 'command', el('input', { placeholder: '!hello' }))));
  } else if (t.type === 'chat') {
    extra.push(field('Contains keyword (blank = any)', bind(t, 'keyword', el('input'))));
  } else if (t.type === 'like') {
    extra.push(field('Min likes in one tap burst', bind(t, 'minLikes', el('input', { type: 'number', min: 1 }), Number)));
  }

  const enabled = el('input', { type: 'checkbox', checked: rule.enabled, title: 'Enabled' });
  enabled.addEventListener('change', () => { rule.enabled = enabled.checked; });

  return el('div', { class: 'rule' },
    el('div', { class: 'rule-head' },
      enabled,
      bind(rule, 'name', el('input', { type: 'text' })),
      el('button', { class: 'small', onclick: () => testRule(rule) }, 'Test'),
      el('button', { class: 'small danger', onclick: () => { config.rules.splice(idx, 1); renderRules(); } }, 'Delete')
    ),
    el('div', { class: 'grid' },
      field('When…', typeSel),
      ...extra,
      field('Cooldown (seconds)', bind(rule, 'cooldown', el('input', { type: 'number', min: 0 }), Number))
    ),
    el('div', { class: 'grid' },
      field('Alert text', bind(rule.alert, 'text', el('input', { placeholder: 'Leave empty for no alert' }))),
      field('Alert image / GIF URL', bind(rule.alert, 'image', el('input', { placeholder: '{avatar} or https://…' }))),
      field('Sound URL (mp3/wav)', bind(rule.alert, 'sound', el('input', { placeholder: 'https://… or /sounds/file.mp3' }))),
      field('Duration (s)', bind(rule.alert, 'duration', el('input', { type: 'number', min: 1 }), Number)),
      field('Speak (TTS)', bind(rule, 'tts', el('input', { placeholder: 'Thanks {nickname}!' })))
    )
  );
}

function testRule(rule) {
  const sample = { nickname: 'Test User', username: 'test_user', avatar: '', giftName: rule.trigger.giftName || 'Rose', giftImage: '', count: 5, coins: 5, comment: rule.trigger.command || 'hello', likes: 10 };
  const fill = (s) => String(s || '').replace(/\{(\w+)\}/g, (m, k) => (k in sample ? sample[k] : m));
  api('POST', '/api/test-alert', {
    text: fill(rule.alert?.text), image: fill(rule.alert?.image), sound: rule.alert?.sound, duration: rule.alert?.duration, tts: fill(rule.tts)
  });
  toast('Sent test to overlays');
}

$('#addRule').addEventListener('click', () => {
  config.rules.push({
    id: `rule-${Date.now()}`, enabled: true, name: 'New rule',
    trigger: { type: 'gift', giftName: '', minCoins: 1 },
    alert: { text: '{nickname} sent {giftName}!', image: '{giftImage}', sound: '', duration: 4 },
    tts: '', cooldown: 0
  });
  renderRules();
});

async function saveConfig(partial, msg = 'Saved') {
  try {
    const saved = await api('PUT', '/api/config', partial);
    config = { ...config, ...saved };
    toast(msg);
  } catch (e) { toast(e.message); }
}
$('#saveRules').addEventListener('click', () => saveConfig({ rules: config.rules }, 'Rules saved'));

// ---------- goals ----------
function renderGoals() {
  const wrap = $('#goals');
  wrap.replaceChildren();
  for (const [key, g] of Object.entries(config.goals)) {
    const en = el('input', { type: 'checkbox', checked: g.enabled });
    en.addEventListener('change', () => { g.enabled = en.checked; });
    const label = el('input', { value: g.label });
    label.addEventListener('input', () => { g.label = label.value; });
    const target = el('input', { type: 'number', min: 1, value: g.target });
    target.addEventListener('input', () => { g.target = Number(target.value) || 1; });
    wrap.append(el('div', { class: 'rule' },
      el('div', { class: 'rule-head' }, en, el('b', {}, key)),
      el('div', { class: 'grid' }, field('Label', label), field('Target', target))
    ));
  }
}
$('#saveGoals').addEventListener('click', () => saveConfig({ goals: config.goals }, 'Goals saved'));

// ---------- TTS ----------
const synth = window.speechSynthesis;
function loadVoices() {
  if (!synth) return;
  const sel = $('#ttsVoice');
  const current = config?.tts.voice || '';
  sel.replaceChildren(el('option', { value: '' }, 'System default'),
    ...synth.getVoices().map((v) => el('option', { value: v.name }, `${v.name} (${v.lang})`)));
  sel.value = current;
}
synth?.addEventListener?.('voiceschanged', loadVoices);

function renderTts() {
  const t = config.tts;
  $('#ttsEnabled').checked = t.enabled;
  $('#ttsMode').value = t.mode;
  $('#ttsPrefix').value = t.prefix;
  $('#ttsMax').value = t.maxLength;
  $('#ttsRate').value = t.rate;
  try { $('#ttsLocal').checked = localStorage.getItem('ttsLocal') === '1'; } catch {}
  loadVoices();
}
$('#ttsLocal').addEventListener('change', (e) => { try { localStorage.setItem('ttsLocal', e.target.checked ? '1' : '0'); } catch {} });
$('#saveTts').addEventListener('click', () => saveConfig({
  tts: {
    enabled: $('#ttsEnabled').checked, mode: $('#ttsMode').value, prefix: $('#ttsPrefix').value || '!tts',
    maxLength: Number($('#ttsMax').value) || 150, voice: $('#ttsVoice').value, rate: Number($('#ttsRate').value) || 1
  }
}, 'TTS saved'));

socket.on('tts', ({ text }) => {
  let local = false;
  try { local = localStorage.getItem('ttsLocal') === '1'; } catch {}
  if (!local || !synth || !config) return;
  const u = new SpeechSynthesisUtterance(text);
  const voice = synth.getVoices().find((v) => v.name === config.tts.voice);
  if (voice) u.voice = voice;
  u.rate = config.tts.rate || 1;
  synth.speak(u);
});

// ---------- overlays ----------
function renderOverlayLinks() {
  const base = location.origin;
  const links = [
    ['Alerts (+ sounds & TTS)', '/overlays/alerts.html'],
    ['Chat box', '/overlays/chat.html'],
    ['Top gifters', '/overlays/gifters.html'],
    ...Object.entries(config.goals).map(([k, g]) => [`Goal: ${g.label}`, `/overlays/goal.html?goal=${k}`]),
    ['Event ticker (recent follows/gifts)', '/overlays/ticker.html']
  ];
  $('#overlayLinks').replaceChildren(...links.map(([label, p]) => {
    const url = base + p;
    return el('div', { class: 'overlay-link' },
      el('span', { style: 'min-width:200px' }, label),
      el('code', {}, url),
      el('button', { class: 'small', onclick: () => navigator.clipboard.writeText(url).then(() => toast('Copied')) }, 'Copy'),
      el('button', { class: 'small', onclick: () => window.open(url, '_blank') }, 'Open')
    );
  }));
}
$('#testAlertBtn').addEventListener('click', () => api('POST', '/api/test-alert', { text: $('#testText').value }));

// ---------- settings ----------
function renderSettings() {
  $('#autoReconnect').checked = config.autoReconnect;
  $('#keyState').textContent = config.hasSignApiKey ? 'A key is saved.' : 'No key saved.';
}
$('#saveSettings').addEventListener('click', () => {
  const body = { autoReconnect: $('#autoReconnect').checked };
  const key = $('#signApiKey').value.trim();
  if (key) body.signApiKey = key;
  saveConfig(body, 'Settings saved').then(() => { $('#signApiKey').value = ''; renderSettings(); });
});

// ---------- boot ----------
(async function init() {
  config = await api('GET', '/api/config');
  $('#username').value = config.username ? `@${config.username}` : '';
  $('#simGift').append(...config.simGifts.map((g) => el('option', { value: g }, g)));
  renderRules();
  renderGoals();
  renderTts();
  renderOverlayLinks();
  renderSettings();
})();
