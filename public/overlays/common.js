// flock.tt (c) 2026 siteflowrespond-bit. Owner proof sha256:99891628516a57a623400d9ccde22b170ecfac1527631e923149d480260a9270
/* Helpers shared by every overlay page. */
window.params = new URLSearchParams(location.search);
// Tell flock.tt which overlay this is, so the app can show what's open on stream.
if (typeof window.io === 'function' && !window.io.__tagged) {
  const realIo = window.io;
  window.io = (opts = {}) => realIo({ ...opts, query: { ...(opts.query || {}), ovpage: location.pathname + location.search } });
  window.io.__tagged = true;
}
// ?theme=white (default is black)
if (params.get('theme')) document.documentElement.dataset.theme = params.get('theme');
// Custom colours: ?accent=ff3366 &text=ffffff &panel=1a1a2e (hex, with or without #). They sit on top of the theme.
(function customColours() {
  const hex = (k) => { const v = (params.get(k) || '').replace(/^#/, ''); return /^[0-9a-f]{6}$/i.test(v) ? `#${v.toLowerCase()}` : ''; };
  const light = (h) => { const n = parseInt(h.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) > 150; };
  const root = document.documentElement.style;
  const accent = hex('accent'), text = hex('text'), panel = hex('panel');
  if (accent) {
    for (const v of ['a', 'ember', 'butter', 'mint', 'lilac', 'rose', 'sky', 'team-a', 'avatar-bg']) root.setProperty(`--tt-${v}`, accent);
    root.setProperty('--tt-avatar-fg', light(accent) ? '#000000' : '#ffffff');
    root.setProperty('--tt-on-accent', light(accent) ? '#000000' : '#ffffff');
  }
  if (text) {
    root.setProperty('--tt-text', text);
    root.setProperty('--tt-dim', `${text}a6`);
    root.setProperty('--tt-line', `${text}29`);
    root.setProperty('--tt-track', `${text}29`);
  }
  if (panel) root.setProperty('--tt-panel', `${panel}db`);
})();
/** Theme colours for canvas drawing (CSS variables resolved to strings). */
window.tt = (name) => getComputedStyle(document.documentElement).getPropertyValue(`--tt-${name}`).trim();
window.ttPalette = () => ['ember', 'butter', 'mint', 'lilac', 'rose', 'sky'].map(tt);
/** Mix a hex colour toward white (amt > 0) or black (amt < 0). */
window.ttShade = (hex, amt) => {
  const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16);
  const ch = [n >> 16, (n >> 8) & 255, n & 255].map((c) => Math.round(amt > 0 ? c + (255 - c) * amt : c * (1 + amt)));
  return `#${ch.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
};
window.el = function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k in node) node[k] = v;
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null && c !== false) node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return node;
};
window.avatarEl = function avatarEl(user, size = 32) {
  const style = `width:${size}px;height:${size}px`;
  let h = 0; for (const ch of (user && user.nickname) || '?') h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  if (user && user.avatar) return el('img', { class: 'avatar', src: user.avatar, alt: '', style, referrerPolicy: 'no-referrer' });
  return el('span', { class: 'avatar', style }, ((user && user.nickname) || '?').charAt(0).toUpperCase());
};
/** Pixel density for canvases: the screen's, times the layout's scale-up (?px=) so scaled overlays stay sharp. */
window.ttDPR = () => Math.min(6, Math.min(2, devicePixelRatio || 1) * Math.max(1, Number(params.get('px')) || 1));
window.fmt = (n) => Number(n || 0).toLocaleString();
/** A hex colour from a link (?ca=ff3366 or %23ff3366), or '' if it isn't one. */
window.ttHex = (v) => { const h = String(v || '').trim().replace(/^#/, ''); return /^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(h) ? `#${h.toLowerCase()}` : ''; };
/** True when a custom ?accent= colour is set (black and white otherwise). */
window.ttAccented = () => Boolean(ttHex(params.get('accent')));
/** Runs update() in fixed 60 Hz steps and draw() once per frame, so animations move at the same speed
    whatever the frame rate (OBS often renders browser sources at 30 fps). */
window.ttLoop = function ttLoop(update, draw) {
  const STEP = 1000 / 60;
  let last = 0, acc = 0;
  (function frame(now) {
    acc += Math.min(250, last ? now - last : STEP);
    last = now;
    let n = 0;
    while (acc >= STEP && n < 8) { update(); acc -= STEP; n++; }
    if (n === 8) acc = 0;
    draw();
    requestAnimationFrame(frame);
  })(performance.now());
};
/** In the app's previews (?preview=1) an overlay with nothing to show yet can say what it's waiting for. */
window.ttPreview = params.has('preview');
window.ttHint = function ttHint(text) {
  if (!ttPreview) return;
  let h = document.getElementById('tt-hint');
  if (!h) {
    h = document.createElement('div');
    h.id = 'tt-hint';
    h.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);max-width:86%;padding:10px 16px;border-radius:12px;border:1.5px dashed rgba(255,255,255,.45);background:rgba(0,0,0,.55);color:#fff;font:600 16px/1.3 var(--tt-font);text-align:center;pointer-events:none;z-index:99';
    document.body.append(h);
  }
  h.textContent = text;
  h.hidden = !text;
};
