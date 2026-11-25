// flock.tt (c) 2026 siteflowrespond-bit. Owner proof sha256:99891628516a57a623400d9ccde22b170ecfac1527631e923149d480260a9270
/* Shared particle effects for overlays: confetti, fireworks, sparks.
   Usage: const fx = createFx(); fx.confetti(x, y, { count, spread, power }); fx.firework(x, y); */
window.createFx = function createFx(zIndex = 50) {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = `position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:${zIndex}`;
  document.body.append(canvas);
  const ctx = canvas.getContext('2d');
  const parts = [];
  const rockets = [];
  let dpr = 1, W = 0, H = 0, running = false;
  const COLORS = ['#ffffff', '#ffffff', '#e6e6e6', '#bdbdbd', '#8c8c8c'];

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = innerWidth; H = innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  addEventListener('resize', resize);

  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  function start() { if (!running) { running = true; requestAnimationFrame(loop); } }

  function confetti(x, y, { count = 80, spread = Math.PI / 2.2, angle = -Math.PI / 2, power = 13, colors = COLORS } = {}) {
    for (let i = 0; i < count; i++) {
      const a = angle + rnd(-spread / 2, spread / 2);
      const v = rnd(power * 0.45, power);
      parts.push({ kind: 'paper', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, w: rnd(6, 11), h: rnd(3, 6),
        rot: rnd(0, Math.PI), vr: rnd(-0.3, 0.3), flip: rnd(0, Math.PI), color: pick(colors), life: rnd(160, 240), age: 0 });
    }
    start();
  }

  function sparks(x, y, { count = 24, color, speed = 6, life = 40 } = {}) {
    for (let i = 0; i < count; i++) {
      const a = rnd(0, Math.PI * 2), v = rnd(speed * 0.3, speed);
      parts.push({ kind: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, color: color || pick(COLORS), life: rnd(life * 0.6, life), age: 0, size: rnd(1.5, 3) });
    }
    start();
  }

  function explode(x, y, color) {
    const n = 70, ring = Math.random() < 0.35;
    const c2 = pick(COLORS);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd(-0.05, 0.05);
      const v = ring ? 5.2 : rnd(1.5, 6.5);
      parts.push({ kind: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, color: i % 3 ? color : c2, life: rnd(55, 85), age: 0, size: rnd(1.8, 3.2), trail: [] });
    }
  }

  function firework(x = rnd(W * 0.15, W * 0.85), peakY = rnd(H * 0.12, H * 0.4), color = pick(COLORS)) {
    const vy = -Math.sqrt(2 * 0.16 * (H - peakY));
    rockets.push({ x, y: H + 10, vx: rnd(-0.8, 0.8), vy, color, trail: [] });
    start();
  }

  function loop() {
    ctx.clearRect(0, 0, W, H);
    for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i];
      r.trail.push([r.x, r.y]); if (r.trail.length > 10) r.trail.shift();
      r.x += r.vx; r.y += r.vy; r.vy += 0.16;
      ctx.strokeStyle = r.color; ctx.lineWidth = 2; ctx.globalAlpha = 0.8;
      ctx.beginPath(); r.trail.forEach(([tx, ty], j) => (j ? ctx.lineTo(tx, ty) : ctx.moveTo(tx, ty))); ctx.stroke();
      if (r.vy >= -0.5) { explode(r.x, r.y, r.color); rockets.splice(i, 1); }
    }
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.age++;
      const t = p.age / p.life;
      if (t >= 1 || p.y > H + 40) { parts.splice(i, 1); continue; }
      if (p.kind === 'paper') {
        p.vx *= 0.985; p.vy = p.vy * 0.985 + 0.22; p.x += p.vx + Math.sin(p.age / 9 + p.flip) * 0.6; p.y += p.vy;
        p.rot += p.vr; p.flip += 0.12;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(1, Math.cos(p.flip));
        ctx.globalAlpha = t > 0.8 ? (1 - t) / 0.2 : 1;
        ctx.fillStyle = p.color; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
      } else {
        if (p.trail) { p.trail.push([p.x, p.y]); if (p.trail.length > 5) p.trail.shift(); }
        p.vx *= 0.97; p.vy = p.vy * 0.97 + 0.06; p.x += p.vx; p.y += p.vy;
        ctx.globalAlpha = 1 - t;
        ctx.fillStyle = p.color; ctx.strokeStyle = p.color;
        if (p.trail && p.trail.length > 1) {
          ctx.lineWidth = p.size; ctx.beginPath(); p.trail.forEach(([tx, ty], j) => (j ? ctx.lineTo(tx, ty) : ctx.moveTo(tx, ty))); ctx.stroke();
        } else { ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill(); }
      }
    }
    ctx.globalAlpha = 1;
    if (parts.length || rockets.length) requestAnimationFrame(loop); else { running = false; ctx.clearRect(0, 0, W, H); }
  }

  return { confetti, sparks, firework, get width() { return W; }, get height() { return H; } };
};

/** Load an image for canvas drawing; resolves null on failure. */
window.loadImg = function loadImg(src) {
  return new Promise((res) => {
    if (!src) return res(null);
    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = src;
  });
};

/** Short synth click/pop/chime without sound files. Browsers may block audio until a click. */
window.blip = (() => {
  let ac = null;
  return function blip(freq = 900, dur = 0.04, type = 'square', vol = 0.06) {
    try {
      ac ||= new (window.AudioContext || window.webkitAudioContext)();
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(vol, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
      o.connect(g).connect(ac.destination); o.start(); o.stop(ac.currentTime + dur);
    } catch {}
  };
})();
