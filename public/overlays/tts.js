// flock.tt (c) 2026 siteflowrespond-bit. Owner proof sha256:99891628516a57a623400d9ccde22b170ecfac1527631e923149d480260a9270
/* Text-to-speech for overlays: one message at a time, voice settings from the Voice page,
   chat messages dropped when too many are waiting, and Skip / Clear from the dashboard.
   Usage: startTts(socket, { volume }) */
function startTts(socket, { volume = 1 } = {}) {
  const synth = window.speechSynthesis;
  if (!synth) return;
  let cfg = {}, queue = [], speaking = false;
  socket.on('config', (c) => { cfg = c.tts || {}; });
  socket.on('tts', (m) => {
    if (m.kind === 'chat' && queue.filter((q) => q.kind === 'chat').length >= (Number(cfg.maxQueue) || 5)) return;
    queue.push(m); next();
  });
  socket.on('ttsControl', ({ action }) => {
    if (action === 'clear') queue = [];
    if (action === 'skip' || action === 'clear') { speaking = false; synth.cancel(); next(); }
  });
  function next() {
    if (speaking || !queue.length) return;
    const { text } = queue.shift();
    const u = new SpeechSynthesisUtterance(text);
    const v = synth.getVoices().find((x) => x.name === cfg.voice);
    try { if (v) u.voice = v; } catch { /* voice not usable here: keep the default */ }
    u.rate = Number(cfg.rate) || 1;
    u.pitch = Number(cfg.pitch) || 1;
    u.volume = Math.max(0, Math.min(1, (cfg.volume ?? 1) * volume));
    speaking = true;
    // onend can go missing in some browsers; never let one message block the rest
    const done = () => { if (!speaking) return; speaking = false; clearTimeout(guard); next(); };
    const guard = setTimeout(done, 4000 + text.length * 160 / u.rate);
    u.onend = done; u.onerror = done;
    synth.speak(u);
  }
}
