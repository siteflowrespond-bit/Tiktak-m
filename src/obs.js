// flock.tt (c) 2026 siteflowrespond-bit. Owner proof sha256:99891628516a57a623400d9ccde22b170ecfac1527631e923149d480260a9270
import { EventEmitter } from 'node:events';
import { OBSWebSocket } from 'obs-websocket-js/json'; // JSON protocol; OBS speaks both JSON and msgpack

/**
 * Talks to OBS Studio through its built-in WebSocket server (OBS 28+: Tools → WebSocket Server Settings).
 * Emits 'status' ({ status, detail }) and 'log' (text) for the dashboard.
 */
export class ObsLink extends EventEmitter {
  constructor() {
    super();
    this.obs = new OBSWebSocket();
    this.status = 'disconnected';
    this.detail = '';
    this.timers = new Set();
    this.retry = null;
    this.wanted = false;
    this.obs.on('ConnectionClosed', () => {
      if (this.status === 'connected') this.log('Connection to OBS closed');
      this.setStatus('disconnected', this.wanted ? 'retrying in 10s' : '');
      if (this.wanted) this.#scheduleRetry();
    });
    this.obs.on('CurrentProgramSceneChanged', ({ sceneName }) => this.emit('scene', sceneName));
  }

  setStatus(status, detail = '') {
    this.status = status;
    this.detail = detail;
    this.emit('status', { status, detail });
  }

  log(text) { this.emit('log', { text, ts: Date.now() }); }

  async connect({ url = 'ws://127.0.0.1:4455', password = '' } = {}) {
    this.wanted = true;
    this.opts = { url, password };
    clearTimeout(this.retry);
    try { await this.obs.disconnect(); } catch { /* not connected */ }
    this.setStatus('connecting');
    try {
      const { obsWebSocketVersion } = await this.obs.connect(url, password || undefined);
      const { obsVersion } = await this.obs.call('GetVersion');
      this.setStatus('connected', `OBS ${obsVersion} · websocket ${obsWebSocketVersion}`);
      this.log(`Connected to OBS ${obsVersion}`);
    } catch (err) {
      const msg = friendly(err);
      this.setStatus('error', msg);
      this.#scheduleRetry();
      throw new Error(msg);
    }
  }

  #scheduleRetry() {
    clearTimeout(this.retry);
    if (!this.wanted) return;
    this.retry = setTimeout(() => this.connect(this.opts).catch(() => {}), 10_000);
  }

  async disconnect() {
    this.wanted = false;
    clearTimeout(this.retry);
    try { await this.obs.disconnect(); } catch { /* ignore */ }
    this.setStatus('disconnected');
  }

  /** Scenes with their sources, and audio inputs, for the dashboard dropdowns. */
  async inventory() {
    if (this.status !== 'connected') return { scenes: [], inputs: [], current: '' };
    const { scenes, currentProgramSceneName } = await this.obs.call('GetSceneList');
    const out = [];
    for (const s of [...scenes].reverse()) {
      const { sceneItems } = await this.obs.call('GetSceneItemList', { sceneName: s.sceneName });
      out.push({ name: s.sceneName, sources: sceneItems.map((i) => i.sourceName) });
    }
    const { inputs } = await this.obs.call('GetInputList');
    const audio = [];
    for (const i of inputs) {
      try { await this.obs.call('GetInputMute', { inputName: i.inputName }); audio.push(i.inputName); } catch { /* no audio */ }
    }
    return { scenes: out, inputs: audio, current: currentProgramSceneName };
  }

  later(ms, fn) {
    const t = setTimeout(() => { this.timers.delete(t); fn().catch((e) => this.log(`OBS: ${friendly(e)}`)); }, ms);
    this.timers.add(t);
  }

  async itemId(scene, source) {
    const { sceneItemId } = await this.obs.call('GetSceneItemId', { sceneName: scene, sourceName: source });
    return sceneItemId;
  }

  /** Run one OBS action. `a` = { type, scene, source, input, seconds }. `why` is shown in the log. */
  async run(a, why = '') {
    if (this.status !== 'connected') throw new Error('OBS is not connected');
    const secs = Number(a.seconds) || 0;
    const tail = why ? ` (${why})` : '';
    switch (a.type) {
      case 'scene': {
        const { currentProgramSceneName: before } = await this.obs.call('GetCurrentProgramScene');
        await this.obs.call('SetCurrentProgramScene', { sceneName: a.scene });
        this.log(`Switched to scene "${a.scene}"${tail}`);
        if (secs && before && before !== a.scene) {
          this.later(secs * 1000, async () => {
            await this.obs.call('SetCurrentProgramScene', { sceneName: before });
            this.log(`Back to scene "${before}"`);
          });
        }
        break;
      }
      case 'show':
      case 'hide':
      case 'toggle': {
        const id = await this.itemId(a.scene, a.source);
        let on = a.type === 'show';
        if (a.type === 'toggle') {
          const { sceneItemEnabled } = await this.obs.call('GetSceneItemEnabled', { sceneName: a.scene, sceneItemId: id });
          on = !sceneItemEnabled;
        }
        await this.obs.call('SetSceneItemEnabled', { sceneName: a.scene, sceneItemId: id, sceneItemEnabled: on });
        this.log(`${on ? 'Showed' : 'Hid'} "${a.source}" in "${a.scene}"${tail}`);
        if (secs && a.type !== 'toggle') {
          this.later(secs * 1000, async () => {
            await this.obs.call('SetSceneItemEnabled', { sceneName: a.scene, sceneItemId: id, sceneItemEnabled: !on });
            this.log(`${!on ? 'Showed' : 'Hid'} "${a.source}" again`);
          });
        }
        break;
      }
      case 'mute':
      case 'unmute':
        await this.obs.call('SetInputMute', { inputName: a.input, inputMuted: a.type === 'mute' });
        this.log(`${a.type === 'mute' ? 'Muted' : 'Unmuted'} "${a.input}"${tail}`);
        if (secs) this.later(secs * 1000, async () => { await this.obs.call('SetInputMute', { inputName: a.input, inputMuted: a.type !== 'mute' }); this.log(`"${a.input}" back to ${a.type === 'mute' ? 'unmuted' : 'muted'}`); });
        break;
      case 'togglemute': {
        const { inputMuted } = await this.obs.call('ToggleInputMute', { inputName: a.input });
        this.log(`${inputMuted ? 'Muted' : 'Unmuted'} "${a.input}"${tail}`);
        break;
      }
      default:
        throw new Error(`Unknown OBS action "${a.type}"`);
    }
  }
}

function friendly(err) {
  const msg = err?.message || String(err);
  if (/ECONNREFUSED|connect ECONN|Failed to connect|socket hang up|1006/i.test(msg)) return 'OBS is not reachable. Is OBS open, and is the WebSocket server turned on (Tools → WebSocket Server Settings)?';
  if (/auth/i.test(msg) || err?.code === 4009) return 'Wrong OBS WebSocket password.';
  if (/No (source|scene item)s? (was|were) found|not found/i.test(msg)) return `OBS couldn't find that scene or source. Check the names (they must match exactly).`;
  return msg;
}
