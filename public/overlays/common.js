/* Helpers shared by every overlay page. */
window.params = new URLSearchParams(location.search);
window.el = function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k in node) node[k] = v;
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return node;
};
window.avatarEl = function avatarEl(user, size = 32) {
  const style = `width:${size}px;height:${size}px`;
  if (user && user.avatar) return el('img', { class: 'avatar', src: user.avatar, alt: '', style, referrerPolicy: 'no-referrer' });
  return el('span', { class: 'avatar', style }, ((user && user.nickname) || '?').charAt(0).toUpperCase());
};
window.fmt = (n) => Number(n || 0).toLocaleString();
