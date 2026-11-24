/* Helpers shared by every overlay page. */
window.params = new URLSearchParams(location.search);
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
  const colors = ['#e8453c', '#d9822b', '#3b8ea5', '#6a994e', '#9b5de5', '#c9184a'];
  let h = 0; for (const ch of (user && user.nickname) || '?') h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  if (user && user.avatar) return el('img', { class: 'avatar', src: user.avatar, alt: '', style, referrerPolicy: 'no-referrer' });
  return el('span', { class: 'avatar', style: `${style};background:${colors[h % colors.length]}` }, ((user && user.nickname) || '?').charAt(0).toUpperCase());
};
window.fmt = (n) => Number(n || 0).toLocaleString();
