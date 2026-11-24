/* Demo stand-in for socket.io inside overlays: listens to the demo dashboard
   through the parent window (when embedded) or a BroadcastChannel (when opened in its own tab). */
window.io = function io() {
  const handlers = {};
  const deliver = (evt, data) => (handlers[evt] || []).forEach((fn) => fn(data));
  let bus = null;
  try { bus = window.parent !== window && window.parent.__tiktakBus; } catch {}
  if (bus) {
    // subscribe after the overlay script has registered its handlers
    setTimeout(() => bus.subscribe(deliver), 0);
  } else {
    try {
      const ch = new BroadcastChannel('tiktak-demo');
      ch.onmessage = (m) => deliver(m.data.evt, m.data.data);
      setTimeout(() => ch.postMessage({ hello: true }), 0);
    } catch {}
  }
  return { on(evt, fn) { (handlers[evt] ||= []).push(fn); }, emit() {} };
};
