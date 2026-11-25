// flock.tt (c) 2026 siteflowrespond-bit. Owner proof sha256:99891628516a57a623400d9ccde22b170ecfac1527631e923149d480260a9270
/* Plays sound actions sent by the server. Include after socket.io + common.js and call playSounds(socket). */
window.playSounds = function playSounds(socket, { masterVolume = 1, maxAtOnce = 4 } = {}) {
  const playing = new Set();
  function playOne(src, volume) {
    if (playing.size >= maxAtOnce) return;
    const a = new Audio(src);
    a.volume = Math.max(0, Math.min(1, volume * masterVolume));
    playing.add(a);
    const done = () => playing.delete(a);
    a.addEventListener('ended', done);
    a.addEventListener('error', done);
    a.play().catch(() => { done(); window.dispatchEvent(new Event('sound-blocked')); });
  }
  socket.on('sound', ({ src, volume = 1, times = 1 }) => {
    for (let i = 0; i < times; i++) setTimeout(() => playOne(src, volume), i * 140);
  });
  socket.on('config', (c) => { if (c.sounds) maxAtOnce = c.sounds.maxAtOnce || maxAtOnce; });
  return playOne;
};
