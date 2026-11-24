// Builds a static, server-free demo of Murmura into demo-dist/.
// The real dashboard and overlays are used as-is; the Node backend is replaced
// by scripts/demo/backend.js, which runs the same engine in the browser.
// Run: npm run demo:build   (then open demo-dist/index.html through any static server)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUB = path.join(ROOT, 'public');
const OUT = path.join(ROOT, 'demo-dist');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const write = (p, s) => { fs.mkdirSync(path.dirname(path.join(OUT, p)), { recursive: true }); fs.writeFileSync(path.join(OUT, p), s); };

fs.rmSync(OUT, { recursive: true, force: true });

// 1. Engine, simulator and defaults, made browser-ready
const emitter = `class EventEmitter {
  constructor() { this._h = {}; }
  on(e, f) { (this._h[e] ||= []).push(f); return this; }
  emit(e, ...a) { (this._h[e] || []).forEach((f) => f(...a)); return true; }
}`;
const stripModule = (src) => src.replace(/^import .*$/gm, '').replace(/^export /gm, '');
const cfg = read('src/config.js');
const defaults = cfg.slice(cfg.indexOf('export const DEFAULT_CONFIG'), cfg.indexOf('function merge')).replace('export ', '');
const engineCode = [emitter, defaults, stripModule(read('src/engine.js')), stripModule(read('src/simulate.js'))].join('\n\n');
write('demo-backend.js', read('scripts/demo/backend.js').replace('/* @@ENGINE@@ */', engineCode));
write('overlays/demo-socket.js', read('scripts/demo/socket.js'));

// 2. Dashboard page: drop the document wrapper (the host adds one), use relative paths, add the demo note
let page = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8')
  .replace(/<!doctype html>\s*/i, '').replace(/<\/?html[^>]*>\s*/g, '').replace(/<\/?head>\s*/g, '').replace(/<\/?body>\s*/g, '')
  .replace(/<meta charset[^>]*>\s*/, '').replace(/<meta name="viewport"[^>]*>\s*/, '')
  .replace('<title>murmura</title>', '<title>Murmura</title>')
  .replaceAll('href="/style.css"', 'href="style.css"').replaceAll('/logo.svg', 'logo.svg')
  .replace('<script src="/socket.io/socket.io.js"></script>', '<script src="demo-backend.js"></script>')
  .replace('<script src="/dashboard.js"></script>', '<script src="dashboard.js"></script>')
  .replace('<script src="/editor.js"></script>', '<script src="editor.js"></script>')
  .replace('<script src="/obs-ui.js"></script>', '<script src="obs-ui.js"></script>')
  .replace('<div class="content">', `<div class="content">
      <div class="demo-note">Demo: the viewers, gifts and chat here are made up and nothing connects to TikTok. Click <b>Disconnect</b> to stop the traffic, or use <b>Test events</b>. Turn on sound under <b>Sounds</b> → "Also play sounds in this tab".</div>`);
write('index.html', page);

// 3. Static files
let css = fs.readFileSync(path.join(PUB, 'style.css'), 'utf8');
css += `\n/* demo only */\n.demo-note { margin-bottom: 16px; padding: 10px 14px; border: 1px dashed var(--line-2); border-radius: 6px; color: var(--dim); font-size: 13px; }\n.demo-note b { color: var(--text); font-weight: 600; }\n`;
write('style.css', css);
for (const f of ['dashboard.js', 'editor.js', 'obs-ui.js', 'logo.svg']) fs.copyFileSync(path.join(PUB, f), path.join(OUT, f));
for (const f of fs.readdirSync(path.join(PUB, 'overlays'))) {
  let s = fs.readFileSync(path.join(PUB, 'overlays', f), 'utf8');
  if (f.endsWith('.html')) s = s.replace('<script src="/socket.io/socket.io.js"></script>', '<script src="demo-socket.js"></script>');
  write(`overlays/${f}`, s);
}
fs.mkdirSync(path.join(OUT, 'sounds', 'builtin'), { recursive: true });
for (const f of fs.readdirSync(path.join(PUB, 'sounds', 'builtin'))) fs.copyFileSync(path.join(PUB, 'sounds', 'builtin', f), path.join(OUT, 'sounds', 'builtin', f));

console.log('Demo written to', OUT);
