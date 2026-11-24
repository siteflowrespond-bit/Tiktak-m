// Builds the public website into site-dist/: the homepage (site/) at the root and the demo at /demo/.
// Deployed to https://flocktt.xyz by .github/workflows/pages.yml.  Run: npm run site:build
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'site-dist');
const DOMAIN = 'flocktt.xyz';

execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build-demo.js')], { stdio: 'inherit' });

fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, 'site'), OUT, { recursive: true });
fs.copyFileSync(path.join(ROOT, 'public', 'logo.svg'), path.join(OUT, 'logo.svg'));
fs.cpSync(path.join(ROOT, 'demo-dist'), path.join(OUT, 'demo'), { recursive: true });

// The demo page is written for a host that adds the document wrapper; give it a full document here.
const demoIndex = path.join(OUT, 'demo', 'index.html');
const body = fs.readFileSync(demoIndex, 'utf8');
const cut = body.indexOf('<svg');
const head = body.slice(0, cut).replace('<title>flock.tt</title>', '<title>flock.tt demo</title>');
const rest = body.slice(cut).replace('<div class="demo-note">Demo:', `<div class="demo-note"><a href="../" style="color:var(--ember);font-weight:700;text-decoration:none">← ${DOMAIN}</a> · Demo:`);
fs.writeFileSync(demoIndex, `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="Try flock.tt in your browser with pretend viewers.">
  ${head.trim()}
</head>
<body>
${rest}
</body>
</html>
`);

fs.writeFileSync(path.join(OUT, 'CNAME'), `${DOMAIN}\n`);
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
console.log('Site written to', OUT);
