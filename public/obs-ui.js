/* OBS page: connection, scene buttons, "when X happens do Y in OBS" actions and an activity log.
   Uses helpers from dashboard.js (config, api, el, icon, toast, saveConfig, markUnsaved, socket, triggerSelect, triggerDetails, triggerText). */
/* global config, api, el, icon, toast, saveConfig, markUnsaved, socket, triggerSelect, triggerDetails, triggerText */

const obsUi = { status: 'disconnected', detail: '', scenes: [], inputs: [], current: '', ready: false };
const $o = (s) => document.querySelector(s);
const OBS_ACTIONS = [
  ['scene', 'Switch to scene'], ['show', 'Show a source'], ['hide', 'Hide a source'], ['toggle', 'Show/hide a source'],
  ['mute', 'Mute audio'], ['unmute', 'Unmute audio'], ['togglemute', 'Toggle mute']
];
const UNDO_LABEL = { scene: 'Switch back after', show: 'Hide again after', hide: 'Show again after', mute: 'Unmute after', unmute: 'Mute again after' };

// ── connection ──
function obsDrawStatus() {
  const { status, detail } = obsUi;
  $o('#obsPill').className = `onair ${status === 'connected' ? 'connected' : status}`;
  $o('#obsPillText').textContent = { connected: 'Connected', connecting: 'Connecting', error: 'Not connected', disconnected: 'Not connected' }[status] || status;
  $o('#obsDetail').textContent = detail || (status === 'connected' ? '' : 'Open OBS and connect to control scenes and sources from your LIVE.');
  $o('#obsDetail').classList.toggle('err', status === 'error');
  $o('#obsConnect').textContent = status === 'connected' || status === 'connecting' ? 'Disconnect' : 'Connect to OBS';
  $o('#obsConnect').classList.toggle('red', !(status === 'connected' || status === 'connecting'));
}

async function obsLoad() {
  try {
    const r = await api('GET', '/api/obs');
    Object.assign(obsUi, { scenes: r.scenes || [], inputs: r.inputs || [], current: r.current || '' });
  } catch { /* keep what we had */ }
  obsDrawScenes();
  obsRenderRules();
}

function obsDrawScenes() {
  const box = $o('#obsScenes');
  if (obsUi.status !== 'connected') { box.replaceChildren(el('span', { class: 'faint' }, 'Connect to see your scenes.')); return; }
  box.replaceChildren(...obsUi.scenes.map((s) => el('button', {
    class: `btn sm${s.name === obsUi.current ? ' live' : ''}`,
    onclick: () => api('POST', '/api/obs/run', { action: { type: 'scene', scene: s.name } }).then(() => { obsUi.current = s.name; obsDrawScenes(); }).catch((e) => toast(e.message, true))
  }, s.name)));
}

$o('#obsConnect').addEventListener('click', async () => {
  if (obsUi.status === 'connected' || obsUi.status === 'connecting') { await api('POST', '/api/obs/disconnect'); return; }
  const btn = $o('#obsConnect');
  btn.disabled = true;
  try {
    await api('POST', '/api/obs/connect', { url: $o('#obsUrl').value.trim() || 'ws://127.0.0.1:4455', password: $o('#obsPass').value, autoConnect: $o('#obsAuto').checked });
    $o('#obsPass').value = '';
    $o('#obsPass').placeholder = 'Saved';
    toast('Connected to OBS');
    obsLoad();
  } catch (e) { toast(e.message, true); } finally { btn.disabled = false; }
});
$o('#obsAuto').addEventListener('change', () => saveConfig({ obs: { autoConnect: $o('#obsAuto').checked } }, $o('#obsAuto').checked ? 'Murmura will connect to OBS when it starts' : 'Auto-connect turned off'));
$o('#obsRefresh').addEventListener('click', obsLoad);

socket.on('obsStatus', (st) => {
  const was = obsUi.status;
  Object.assign(obsUi, st);
  if (!obsUi.ready) return;
  obsDrawStatus();
  if (st.status === 'connected' && was !== 'connected') obsLoad();
  if (st.status !== 'connected') { obsDrawScenes(); obsRenderRules(); }
});

// ── log ──
function obsAddLog({ text, ts, err }) {
  const log = $o('#obsLog');
  log.querySelector('.faint')?.remove();
  log.prepend(el('div', { class: `e${err || /^Could not/.test(text) ? ' err' : ''}` },
    el('span', { class: 't' }, new Date(ts || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })), el('span', {}, text)));
  while (log.children.length > 100) log.lastChild.remove();
}
socket.on('obsLog', (entry) => {
  obsAddLog(entry);
  const m = /^Switched to scene "(.+?)"|^Back to scene "(.+?)"/.exec(entry.text);
  if (m) { obsUi.current = m[1] || m[2]; obsDrawScenes(); }
});
$o('#obsClearLog').addEventListener('click', () => $o('#obsLog').replaceChildren());

// ── actions ──
function obsSelect(options, value, onChange, placeholder) {
  // With OBS connected: a dropdown of real names. Without: free text, so actions can be set up ahead of time.
  if (!options.length) {
    const i = el('input', { value: value || '', placeholder });
    i.addEventListener('input', () => onChange(i.value));
    return i;
  }
  const sel = el('select', {}, el('option', { value: '' }, placeholder), options.map((o) => el('option', { value: o }, o)));
  if (value && !options.includes(value)) sel.append(el('option', { value }, `${value} (not found)`));
  sel.value = value || '';
  sel.addEventListener('change', () => onChange(sel.value));
  return sel;
}

function obsActionText(a) {
  const t = OBS_ACTIONS.find(([v]) => v === a.type)?.[1] || 'do nothing';
  const what = a.type === 'scene' ? a.scene : ['show', 'hide', 'toggle'].includes(a.type) ? `${a.source || '?'} in ${a.scene || '?'}` : a.input;
  return `${t}${what ? ` "${what}"` : ''}${Number(a.seconds) && UNDO_LABEL[a.type] ? `, undo after ${a.seconds}s` : ''}`;
}

function obsRenderRules() {
  if (!obsUi.ready) return;
  const rules = config.obs.rules;
  const dirty = () => markUnsaved($o('#obsSave'));
  const nodes = [];
  if (obsUi.status !== 'connected' && rules.length) nodes.push(el('div', { class: 'obs-off-note' }, 'OBS is not connected, so these actions won\'t run yet. You can still set them up.'));
  if (!rules.length) nodes.push(el('div', { class: 'panel-body faint' }, 'No OBS actions yet. Example: when someone sends a Galaxy, switch to your "Party" scene for 10 seconds.'));
  rules.forEach((r, idx) => {
    r.action ||= { type: 'scene' };
    const a = r.action;
    const box = el('div', { class: `obsr${r.enabled ? '' : ' off'}`, 'data-id': r.id });
    const on = el('input', { type: 'checkbox', checked: r.enabled, title: 'On/off' });
    on.addEventListener('change', () => { r.enabled = on.checked; box.classList.toggle('off', !on.checked); dirty(); });
    const name = el('input', { type: 'text', value: r.name || '', placeholder: 'Name this action' });
    name.addEventListener('input', () => { r.name = name.value; dirty(); });

    const type = el('select', {}, OBS_ACTIONS.map(([v, l]) => el('option', { value: v }, l)));
    type.value = a.type;
    type.addEventListener('change', () => { r.action = { type: type.value, seconds: a.seconds }; dirty(); obsRenderRules(); });

    const sceneNames = obsUi.scenes.map((s) => s.name);
    const target = [];
    if (a.type === 'scene') target.push(obsSelect(sceneNames, a.scene, (v) => { a.scene = v; dirty(); }, 'Choose a scene'));
    if (['show', 'hide', 'toggle'].includes(a.type)) {
      target.push(obsSelect(sceneNames, a.scene, (v) => { a.scene = v; a.source = ''; dirty(); obsRenderRules(); }, 'In scene'));
      const sources = obsUi.scenes.find((s) => s.name === a.scene)?.sources || [];
      target.push(obsSelect(sources, a.source, (v) => { a.source = v; dirty(); }, 'Source'));
    }
    if (['mute', 'unmute', 'togglemute'].includes(a.type)) target.push(obsSelect(obsUi.inputs, a.input, (v) => { a.input = v; dirty(); }, 'Audio source'));

    const secs = el('input', { type: 'number', min: 0, value: a.seconds || '', placeholder: 'never' });
    secs.addEventListener('input', () => { a.seconds = Number(secs.value) || 0; dirty(); });
    const cd = el('input', { type: 'number', min: 0, value: r.cooldown || 0 });
    cd.addEventListener('input', () => { r.cooldown = Number(cd.value) || 0; dirty(); });

    box.append(
      el('div', { class: 'obsr-top' }, on, name,
        el('button', { class: 'btn sm', title: 'Run it in OBS now', onclick: () => api('POST', '/api/obs/run', { action: a }).then(() => toast('Done in OBS')).catch((e) => toast(e.message, true)) }, icon('play'), 'Test'),
        el('button', { class: 'btn flat sq', title: 'Delete', onclick: () => { rules.splice(idx, 1); dirty(); obsRenderRules(); } }, icon('trash'))),
      el('div', { class: 'obsr-line' }, el('span', {}, 'When'),
        el('div', { class: 'row' }, el('div', { style: 'flex:0 0 160px' }, triggerSelect(r, () => { dirty(); obsRenderRules(); })), el('div', { class: 'grow' }, triggerDetails(r.trigger, dirty, true)))),
      el('div', { class: 'obsr-line' }, el('span', {}, 'Do in OBS'),
        el('div', { class: 'row' }, el('div', { style: 'flex:0 0 160px' }, type), ...target.map((t) => el('div', { class: 'grow' }, t)))),
      el('div', { class: 'obsr-line' }, el('span', {}, 'Timing'),
        el('div', { class: 'row', style: 'gap:14px;flex-wrap:wrap' },
          UNDO_LABEL[a.type] ? el('label', { class: 'check' }, UNDO_LABEL[a.type], secs, 'sec') : null,
          el('label', { class: 'check' }, 'Wait between runs', cd, 'sec'))));
    nodes.push(box);
  });
  $o('#obsRules').replaceChildren(...nodes);
}

$o('#obsAdd').addEventListener('click', () => {
  config.obs.rules.push({ id: `obs-${Date.now().toString(36)}`, enabled: true, name: '', trigger: { type: 'gift', giftName: '', minCoins: 1000 }, action: { type: 'scene', scene: '', seconds: 10 }, cooldown: 0 });
  markUnsaved($o('#obsSave'));
  obsRenderRules();
  $o('#obsRules .obsr:last-child')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
});
$o('#obsSave').addEventListener('click', (e) => saveConfig({ obs: { rules: config.obs.rules } }, 'OBS actions saved', e.currentTarget));

// called by dashboard.js once the config is loaded
function initObs() {
  if (obsUi.ready) return;
  obsUi.ready = true;
  config.obs ||= { url: 'ws://127.0.0.1:4455', autoConnect: false, rules: [] };
  config.obs.rules ||= [];
  $o('#obsUrl').value = config.obs.url || 'ws://127.0.0.1:4455';
  $o('#obsAuto').checked = !!config.obs.autoConnect;
  $o('#obsPass').placeholder = config.hasObsPassword ? 'Saved' : 'From OBS → Show Connect Info';
  obsDrawStatus();
  obsLoad();
}
if (typeof config !== 'undefined' && config) initObs();
