// Homepage scripts (kept in a file so the page can forbid inline scripts).
// Phones and Macs can't run the Windows installer yet: tell them what to do instead.
(function () {
  const ua = navigator.userAgent, plat = navigator.userAgentData?.platform || navigator.platform || '';
  const phone = navigator.userAgentData?.mobile || /Android|iPhone|iPad|iPod|Mobi/i.test(ua) || (/Mac/i.test(plat) && navigator.maxTouchPoints > 1);
  const mac = !phone && (/Mac/i.test(plat) || /Macintosh/.test(ua));
  const note = document.querySelector('[data-device-note]');
  if (!note || (!phone && !mac)) return;
  note.classList.add('device');
  note.textContent = phone
    ? 'flock.tt runs on a Windows PC. Open this page there to download it, or try the demo now.'
    : 'You\u2019re on a Mac: the Mac version is coming soon. Try the demo in your browser for now.';
})();

// A murmuration: simple flocking (separation, alignment, cohesion) with a slow wandering attractor.
(function () {
  const cv = document.getElementById('flock');
  const ctx = cv.getContext('2d');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W = 0, H = 0, dpr = 1, birds = [], t = 0;
  function size() {
    dpr = Math.min(2, devicePixelRatio || 1);
    W = cv.clientWidth; H = cv.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round(Math.min(420, Math.max(160, (W * H) / 3200)));
    if (birds.length !== n) {
      birds = Array.from({ length: n }, () => ({ x: W * (0.45 + Math.random() * 0.4), y: H * (0.15 + Math.random() * 0.35), vx: Math.random() * 2 - 1, vy: Math.random() * 2 - 1, s: 0.7 + Math.random() * 0.8 }));
    }
  }
  addEventListener('resize', size);
  size();
  function step() {
    t += 0.004;
    // the flock follows a slow figure-eight over the right side of the sky
    // on narrow screens the text fills the width, so keep the flock up high and to the right
    const narrow = W < 700;
    const ax = W * (0.68 + 0.2 * Math.sin(t)), ay = narrow ? H * (0.1 + 0.05 * Math.sin(t * 2.1)) : H * (0.32 + 0.14 * Math.sin(t * 2.1));
    const R = 34, R2 = R * R, sepR2 = 12 * 12;
    // grid for neighbour lookups
    const grid = new Map();
    for (const b of birds) { const k = `${(b.x / R) | 0},${(b.y / R) | 0}`; (grid.get(k) || grid.set(k, []).get(k)).push(b); }
    for (const b of birds) {
      let cx = 0, cy = 0, vx = 0, vy = 0, sx = 0, sy = 0, n = 0;
      const gx = (b.x / R) | 0, gy = (b.y / R) | 0;
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
        const cell = grid.get(`${gx + i},${gy + j}`); if (!cell) continue;
        for (const o of cell) {
          if (o === b) continue;
          const dx = o.x - b.x, dy = o.y - b.y, d2 = dx * dx + dy * dy;
          if (d2 > R2) continue;
          cx += o.x; cy += o.y; vx += o.vx; vy += o.vy; n++;
          if (d2 < sepR2) { sx -= dx / (d2 + 1); sy -= dy / (d2 + 1); }
        }
      }
      if (n) { b.vx += ((cx / n - b.x) * 0.0016 + (vx / n - b.vx) * 0.06); b.vy += ((cy / n - b.y) * 0.0016 + (vy / n - b.vy) * 0.06); }
      b.vx += sx * 0.9 + (ax - b.x) * 0.00018; b.vy += sy * 0.9 + (ay - b.y) * 0.00018;
      const sp = Math.hypot(b.vx, b.vy), max = 2.6, min = 1.2;
      if (sp > max) { b.vx *= max / sp; b.vy *= max / sp; } else if (sp < min) { b.vx *= min / sp; b.vy *= min / sp; }
      b.x += b.vx; b.y += b.vy;
      if (b.y > H * 0.78) b.vy -= 0.08;
    }
  }
  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255, 255, 255, .9)';
    for (const b of birds) {
      // a tiny wing shape pointing along the flight direction
      const a = Math.atan2(b.vy, b.vx), s = b.s * 2.2, flap = Math.sin(t * 60 + b.x) * 0.35;
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(a);
      ctx.beginPath(); ctx.moveTo(s * 1.2, 0); ctx.lineTo(-s, -s * (0.8 + flap)); ctx.lineTo(-s * 0.4, 0); ctx.lineTo(-s, s * (0.8 - flap)); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }
  if (still) { for (let i = 0; i < 400; i++) step(); draw(); return; }
  let visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(cv);
  (function loop() { if (visible && !document.hidden) { step(); draw(); } requestAnimationFrame(loop); })();
})();
