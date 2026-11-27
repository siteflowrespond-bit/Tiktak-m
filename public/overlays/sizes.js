// flock.tt (c) 2026 siteflowrespond-bit. Owner proof sha256:99891628516a57a623400d9ccde22b170ecfac1527631e923149d480260a9270
/* Natural size of each overlay: the size it's designed at. The Layout editor and layout links scale an overlay's
   content to fill its box from this, so making a box bigger makes the overlay bigger and still sharp. */
window.TT_SIZES = {
  'alerts.html': [1080, 480], 'sounds.html': [240, 120], 'chat.html': [680, 640], 'combos.html': [640, 320], 'hearts.html': [460, 900],
  'ticker.html': [1000, 110], 'jar.html': [380, 480], 'wheel.html': [720, 820], 'battle.html': [1000, 260], 'race.html': [1000, 330],
  'topgift.html': [420, 420], 'emojis.html': [1080, 900], 'celebrate.html': [1080, 1920], 'stats.html': [900, 140], 'gifters.html': [520, 330],
  'counter.html': [420, 130], 'timer.html': [600, 240], 'record.html': [520, 210], 'poll.html': [620, 380], 'queue.html': [460, 420], 'banner.html': [900, 90],
  'recent.html': [460, 300], 'camframe.html': [1080, 1920], 'goal.html': [900, 110],
  'hype.html': [620, 140], 'podium.html': [620, 380], 'topfan.html': [380, 420], 'giftcount.html': [520, 120], 'socials.html': [640, 94], 'screen.html': [1080, 1920]
};
/* Effects that fill whatever box they're in, so they're never scaled. */
window.TT_FIT_FREE = new Set(['celebrate.html', 'emojis.html', 'camframe.html', 'hearts.html', 'sounds.html', 'screen.html']);
/** How much to scale an overlay's content to fill a w x h box (1 = natural size). */
window.ttFitScale = function ttFitScale(src, w, h) {
  const file = String(src).split('?')[0];
  const nat = TT_SIZES[file];
  if (!nat || TT_FIT_FREE.has(file)) return 1;
  const z = Math.min(w / nat[0], h / nat[1]);
  return Math.abs(z - 1) < 0.04 ? 1 : Math.max(0.3, Math.min(5, Math.round(z * 100) / 100));
};
/** Put an overlay in a box: the iframe gets the natural-size viewport and is scaled up (or down) to fill the box.
    Canvas overlays are told the scale (?px=) so they draw at the higher resolution and stay crisp. */
window.ttPlace = function ttPlace(iframe, src, w, h) {
  const z = ttFitScale(src, w, h);
  Object.assign(iframe.style, { width: `${w / z}px`, height: `${h / z}px`, transform: z === 1 ? '' : `scale(${z})`, transformOrigin: '0 0' });
  if (z <= 1) return src;
  return `${src}${src.includes('?') ? '&' : '?'}px=${Math.min(4, Math.ceil(z * 4) / 4)}`;
};
