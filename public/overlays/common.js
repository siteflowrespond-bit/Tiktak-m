/* Helpers shared by every overlay page. */
window.params = new URLSearchParams(location.search);
// ?theme=ember|mint|candy|mono
if (params.get('theme')) document.documentElement.dataset.theme = params.get('theme');
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
  const colors = ttPalette().map((c) => ttShade(c, -0.25));
  let h = 0; for (const ch of (user && user.nickname) || '?') h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  if (user && user.avatar) return el('img', { class: 'avatar', src: user.avatar, alt: '', style, referrerPolicy: 'no-referrer' });
  return el('span', { class: 'avatar', style: `${style};background:${colors[h % colors.length]}` }, ((user && user.nickname) || '?').charAt(0).toUpperCase());
};
window.fmt = (n) => Number(n || 0).toLocaleString();
