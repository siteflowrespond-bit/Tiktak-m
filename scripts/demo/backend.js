// flock.tt (c) 2026 siteflowrespond-bit. Owner proof sha256:99891628516a57a623400d9ccde22b170ecfac1527631e923149d480260a9270
/* Demo backend: runs the real flock.tt engine in the browser instead of on a server.
   Replaces fetch('/api/...') and io() so the dashboard works without Node.
   Engine, simulator and default config code are inserted by scripts/build-demo.js. */
(function () {
  const BASE = new URL('.', document.baseURI).href;
  const abs = (src) => (typeof src === 'string' && src.startsWith('/sounds/') ? BASE + src.slice(1) : src);

  /* @@ENGINE@@ */

  // ── state ──
  const config = structuredClone(DEFAULT_CONFIG);
  config.username = 'demo_streamer';
  for (const r of config.sounds.rules) r.sound = abs(r.sound);
  const engine = new Engine(() => config);
  const BUILTIN = ['airhorn', 'applause', 'boing', 'buzzer', 'chime', 'coin', 'ding', 'drumroll', 'laser', 'levelup', 'pop', 'tada', 'whoosh'];
  const library = BUILTIN.map((name) => ({ kind: 'builtin', name, src: `${BASE}sounds/builtin/${name}.wav` }));
  let status = { status: 'disconnected', username: '' };

  // ── socket bus (dashboard + overlay iframes + overlay tabs) ──
  const local = new Map();
  let channel = null;
  try { channel = new BroadcastChannel('flockt-demo'); } catch {}
  const frames = new Set();
  function broadcast(evt, data) {
    (local.get(evt) || []).forEach((fn) => { try { fn(data); } catch (e) { console.error(e); } });
    frames.forEach((fn) => { try { fn(evt, data); } catch { frames.delete(fn); } });
    try { channel?.postMessage({ evt, data }); } catch {}
  }
  function snapshotFor(send) {
    send('status', status);
    send('config', publicConfig());
    send('stats', engine.snapshot());
    send('timer', engine.timerState());
    send('record', engine.record);
  }
  // overlay iframes subscribe directly through the parent window
  window.__flocktBus = { subscribe(fn) { frames.add(fn); snapshotFor(fn); return () => frames.delete(fn); } };
  if (channel) channel.onmessage = (m) => { if (m.data?.hello) snapshotFor((evt, data) => channel.postMessage({ evt, data })); };

  for (const evt of ['event', 'stats', 'alert', 'tts', 'ttsSkipped', 'sound', 'timer', 'record']) engine.on(evt, (d) => broadcast(evt, d));
  const setStatus = (s) => { status = s; broadcast('status', s); };
  const publicConfig = () => { const { signApiKey, ...rest } = config; const { password, ...obs } = config.obs || {}; return { ...rest, obs, hasSignApiKey: false, hasObsPassword: false }; };

  window.io = () => ({
    on(evt, fn) {
      if (!local.has(evt)) local.set(evt, []);
      local.get(evt).push(fn);
      if (evt === 'status') fn(status);
      if (evt === 'stats') fn(engine.snapshot());
      if (evt === 'timer') fn(engine.timerState());
      if (evt === 'record') fn(engine.record);
      if (evt === 'config') fn(publicConfig());
      if (evt === 'obsStatus') fn({ status: fakeObs.status, detail: fakeObs.detail });
    },
    emit() {}
  });

  // ── pretend OBS (the demo can't reach a real OBS) ──
  const fakeObs = {
    status: 'disconnected', detail: '', current: 'Main',
    scenes: [
      { name: 'Main', sources: ['Webcam', 'flock.tt layout', 'Confetti video', 'Mic'] },
      { name: 'Just chatting', sources: ['Webcam (big)', 'flock.tt layout'] },
      { name: 'Gaming', sources: ['Game capture', 'Webcam (small)', 'flock.tt layout'] },
      { name: 'Party', sources: ['Disco lights', 'Webcam', 'flock.tt layout'] },
      { name: 'Be right back', sources: ['BRB screen', 'Music'] }
    ],
    inputs: ['Mic', 'Desktop audio', 'Music']
  };
  const obsStatus = (status, detail = '') => { Object.assign(fakeObs, { status, detail }); broadcast('obsStatus', { status, detail }); };
  const obsLog = (text) => broadcast('obsLog', { text, ts: Date.now() });
  function fakeRun(a, why = '') {
    if (fakeObs.status !== 'connected') throw new Error('OBS is not connected');
    const tail = why ? ` (${why})` : '';
    const secs = Number(a.seconds) || 0;
    if (a.type === 'scene') {
      const before = fakeObs.current;
      fakeObs.current = a.scene; obsLog(`Switched to scene "${a.scene}"${tail}`);
      if (secs && before !== a.scene) setTimeout(() => { fakeObs.current = before; obsLog(`Back to scene "${before}"`); }, secs * 1000);
    } else if (['show', 'hide', 'toggle'].includes(a.type)) {
      const on = a.type !== 'hide';
      obsLog(`${on ? 'Showed' : 'Hid'} "${a.source}" in "${a.scene}"${tail}`);
      if (secs && a.type !== 'toggle') setTimeout(() => obsLog(`${on ? 'Hid' : 'Showed'} "${a.source}" again`), secs * 1000);
    } else obsLog(`${a.type === 'unmute' ? 'Unmuted' : 'Muted'} "${a.input}"${tail}`);
  }
  engine.on('obs', ({ action, why }) => { try { fakeRun(action, why); } catch (e) { /* not connected */ } });

  // ── fake live traffic ──
  let traffic = 0;
  // Pretend gifts have no TikTok picture: show the plain gift-box icon, like the app does before your first LIVE.
  const GIFT_ART = { rose: 'rose', tiktok: 'note', 'finger heart': 'finger-heart', doughnut: 'doughnut', 'hand hearts': 'hand-hearts', galaxy: 'galaxy', lion: 'lion' };
  const giftPic = (evt) => {
    if (evt?.gift && !evt.gift.image) { const a = GIFT_ART[String(evt.gift.name).toLowerCase()]; evt.gift.image = a ? `${BASE}overlays/gifts/${a}.svg` : `${BASE}overlays/gift.svg`; }
    return evt;
  };
  function feed(evt) {
    giftPic(evt);
    if (evt.type === 'gift' && evt.gift.count > 1) {
      const total = evt.gift.count;
      for (let i = 1; i < total; i++) setTimeout(() => engine.handle({ ...evt, type: 'giftStreak', gift: { ...evt.gift, count: i, coins: evt.gift.diamonds * i } }), (i - 1) * 220);
      setTimeout(() => engine.handle(evt), (total - 1) * 220);
    } else engine.handle(evt);
  }
  const WEIGHTS = [['chat', 34], ['like', 30], ['join', 14], ['gift', 12], ['follow', 6], ['share', 3], ['subscribe', 1]];
  function randomType() {
    let r = Math.random() * 100;
    for (const [t, w] of WEIGHTS) { if ((r -= w) < 0) return t; }
    return 'chat';
  }
  let viewers = 40;
  function tick() {
    feed(simulate(randomType(), {}));
    if (Math.random() < 0.15) { viewers = Math.max(5, viewers + Math.round((Math.random() - 0.4) * 12)); engine.handle({ type: 'viewers', viewers, ts: Date.now() }); }
    traffic = setTimeout(tick, 400 + Math.random() * 1100);
  }
  function startLive(username) {
    setStatus({ status: 'connecting', username });
    setTimeout(() => {
      engine.resetStats();
      setStatus({ status: 'connected', username, detail: 'demo room' });
      engine.handle({ type: 'viewers', viewers, ts: Date.now() });
      // a short backlog so the page doesn't open empty
      const seed = ['chat', 'follow', 'chat', 'gift', 'chat', 'like', 'share', 'chat', 'gift', 'chat', 'like', 'chat', 'gift', 'follow'];
      seed.forEach((t) => { const e = giftPic(simulate(t, {})); if (e.gift) { e.gift.count = 1; e.gift.coins = e.gift.diamonds; } engine.handle(e); });
      clearTimeout(traffic);
      tick();
    }, 700);
  }
  function stopLive() { clearTimeout(traffic); traffic = 0; setStatus({ status: 'disconnected', username: '' }); }

  // ── fake REST API ──
  const json = (body, code = 200) => new Response(JSON.stringify(body), { status: code, headers: { 'Content-Type': 'application/json' } });
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    if (!url.pathname.includes('/api/')) return realFetch(input, init);
    const path = url.pathname.slice(url.pathname.indexOf('/api/'));
    const method = (init.method || 'GET').toUpperCase();
    const body = typeof init.body === 'string' ? JSON.parse(init.body || '{}') : init.body;

    if (path === '/api/config' && method === 'GET') return json(publicConfig());
    if (path === '/api/config' && method === 'PUT') {
      const incoming = { ...body }; delete incoming.hasSignApiKey; delete incoming.signApiKey;
      if (incoming.obs) incoming.obs = { ...config.obs, ...incoming.obs };
      Object.assign(config, incoming);
      broadcast('config', publicConfig());
      return json(publicConfig());
    }
    if (path === '/api/gifts') return json(SIM_GIFTS);
    if (path === '/api/obs' && method === 'GET') return json({ status: fakeObs.status, detail: fakeObs.detail, ...(fakeObs.status === 'connected' ? { scenes: fakeObs.scenes, inputs: fakeObs.inputs, current: fakeObs.current } : { scenes: [], inputs: [] }) });
    if (path === '/api/obs/connect') {
      if (body.url) config.obs.url = body.url;
      if (body.autoConnect !== undefined) config.obs.autoConnect = body.autoConnect;
      obsStatus('connecting');
      await new Promise((r) => setTimeout(r, 600));
      obsStatus('connected', 'Pretend OBS for the demo · nothing really changes');
      obsLog('Connected to OBS (demo)');
      return json({ ok: true });
    }
    if (path === '/api/obs/disconnect') { obsStatus('disconnected'); return json({ ok: true }); }
    if (path === '/api/obs/run') { try { fakeRun(body.action || {}, 'test'); return json({ ok: true }); } catch (e) { return json({ error: e.message }, 400); } }
    if (path === '/api/sounds' && method === 'GET') return json(library);
    if (path === '/api/sounds' && method === 'POST') {
      const name = (url.searchParams.get('name') || 'sound').replace(/\.[^.]+$/, '');
      const item = { kind: 'custom', name, src: URL.createObjectURL(body) };
      library.push(item);
      return json(item);
    }
    if (path.startsWith('/api/sounds/') && method === 'DELETE') {
      const file = decodeURIComponent(path.split('/').pop());
      const i = library.findIndex((s) => s.kind === 'custom' && s.src.endsWith(file));
      if (i >= 0) library.splice(i, 1);
      return json({ ok: true });
    }
    if (path === '/api/play-sound') { broadcast('sound', { src: body.src, volume: (body.volume ?? 1) * config.sounds.volume, times: 1 }); return json({ ok: true }); }
    if (path === '/api/record' && method === 'GET') return json(engine.record);
    if (path === '/api/record') { if (!['win', 'loss', 'draw', 'undo', 'reset', 'set'].includes(body.action)) return json({ error: 'Unknown action' }, 400); engine.recordAction(body.action, { values: body }); return json(engine.record); }
    if (path === '/api/timer') { engine.timerAction(body.action, body.seconds); return json(engine.timerState()); }
    if (path === '/api/connect') { const u = (body.username || 'demo_streamer').replace(/^@/, ''); config.username = u; startLive(u); return json({ ok: true }); }
    if (path === '/api/disconnect') { stopLive(); return json({ ok: true }); }
    if (path === '/api/simulate') { const e = simulate(body.type, body); if (!e) return json({ error: 'Unknown event type' }, 400); feed(e); return json(e); }
    if (path === '/api/reset-stats') { engine.resetStats(); return json({ ok: true }); }
    if (path === '/api/tts/say') { const text = String(body.text || '').trim().slice(0, 300); if (!text) return json({ error: 'Type something to say' }, 400); broadcast('tts', { text, kind: 'test' }); return json({ ok: true }); }
    if (path === '/api/tts/control') { if (!['skip', 'clear'].includes(body.action)) return json({ error: 'Unknown action' }, 400); broadcast('ttsControl', { action: body.action }); return json({ ok: true }); }
    if (path === '/api/test-alert') {
      const { text = 'Test alert!', image = '', sound = '', duration = 4, tts = '' } = body;
      if (text) broadcast('alert', { text, image, sound: abs(sound), duration: Number(duration) || 4 });
      if (tts) broadcast('tts', { text: tts });
      return json({ ok: true });
    }
    return json({ error: 'Not in the demo' }, 404);
  };

  // The artifact viewer blocks dialogs; in the demo, confirmations just go ahead.
  window.confirm = () => true;

  // Start with a live-looking stream so there is something to look at.
  startLive('demo_streamer');
})();
