// Generates the built-in sound effects as small WAV files (no external assets needed).
// Run: node scripts/make-sounds.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sounds', 'builtin');
const RATE = 22050;
const TAU = Math.PI * 2;

let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;

function render(seconds, fn) {
  const n = Math.floor(seconds * RATE);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = fn(i / RATE, i);
  return out;
}
const env = (t, a, d) => (t < a ? t / a : Math.exp(-(t - a) / d));
const sq = (p) => (Math.sin(p) >= 0 ? 1 : -1);
const saw = (p) => 2 * ((p / TAU) % 1) - 1;
function mix(...tracks) {
  const len = Math.max(...tracks.map(([buf, off = 0]) => buf.length + Math.floor(off * RATE)));
  const out = new Float32Array(len);
  for (const [buf, off = 0] of tracks) { const o = Math.floor(off * RATE); buf.forEach((v, i) => { out[i + o] += v; }); }
  return out;
}
function lowpass(buf, k) { let y = 0; return buf.map((x) => (y += k * (x - y))); }

function wav(name, data) {
  let peak = 0; for (const v of data) peak = Math.max(peak, Math.abs(v));
  const gain = peak ? 0.89 / peak : 1;
  const b = Buffer.alloc(44 + data.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + data.length * 2, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(RATE, 24); b.writeUInt32LE(RATE * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(data.length * 2, 40);
  data.forEach((v, i) => b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v * gain)) * 32767), 44 + i * 2));
  fs.writeFileSync(path.join(OUT, `${name}.wav`), b);
}

fs.mkdirSync(OUT, { recursive: true });

wav('ding', render(1.4, (t) => env(t, 0.003, 0.35) * (Math.sin(TAU * 1046 * t) + 0.4 * Math.sin(TAU * 2093 * t) + 0.2 * Math.sin(TAU * 3140 * t))));
wav('coin', mix(
  [render(0.08, (t) => 0.5 * sq(TAU * 988 * t))],
  [render(0.45, (t) => 0.5 * sq(TAU * 1319 * t) * env(t, 0.001, 0.15)), 0.08]));
wav('pop', render(0.18, (t) => env(t, 0.002, 0.04) * Math.sin(TAU * (900 - 2600 * t) * t)));
wav('chime', mix(...[784, 988, 1175, 1568].map((f, i) => [render(1.2, (t) => env(t, 0.003, 0.3) * Math.sin(TAU * f * t)), i * 0.09])));
wav('tada', mix(
  ...[523, 659, 784].map((f, i) => [render(0.16, (t) => 0.6 * saw(TAU * f * t) * env(t, 0.005, 0.08)), i * 0.11]),
  [render(1.1, (t) => env(t, 0.01, 0.45) * (saw(TAU * 1046 * t) + saw(TAU * 1318 * t) * 0.7 + saw(TAU * 1568 * t) * 0.5) * 0.4), 0.33]));
wav('airhorn', lowpass(render(1.3, (t) => {
  const vib = 1 + 0.01 * Math.sin(TAU * 6 * t);
  const e = t < 0.03 ? t / 0.03 : t > 1.15 ? Math.max(0, (1.3 - t) / 0.15) : 1;
  return e * (saw(TAU * 415 * vib * t) + saw(TAU * 466 * vib * t) + 0.7 * saw(TAU * 554 * vib * t));
}), 0.35));
wav('laser', render(0.45, (t) => env(t, 0.002, 0.15) * sq(TAU * (1800 * Math.exp(-6 * t)) * t) * 0.6));
wav('boing', render(0.7, (t) => env(t, 0.004, 0.25) * Math.sin(TAU * (180 + 120 * Math.sin(TAU * 9 * t) * Math.exp(-3 * t)) * t)));
wav('whoosh', lowpass(render(0.8, (t) => Math.sin(Math.PI * t / 0.8) ** 2 * rand()), 0.12));
wav('drumroll', mix(
  [render(1.6, (t) => (0.3 + 0.7 * t / 1.6) * rand() * Math.exp(-((t * 28) % 1) * 7) * 0.5)],
  [lowpass(render(1.6, (t) => rand() * env(t, 0.002, 0.5)), 0.6), 1.6]));
wav('applause', lowpass(render(2.6, (t) => {
  const e = t < 0.2 ? t / 0.2 : Math.max(0, 1 - (t - 1.6) / 1.0);
  return e * rand() * (0.4 + 0.6 * Math.abs(Math.sin(TAU * 13 * t + 3 * Math.sin(TAU * 0.7 * t))));
}), 0.45));
wav('buzzer', render(0.6, (t) => env(t, 0.005, 0.5) * (sq(TAU * 110 * t) + sq(TAU * 116 * t)) * 0.4));
wav('levelup', mix(...[523, 659, 784, 1046, 1318].map((f, i) => [render(0.14, (t) => 0.5 * sq(TAU * f * t) * env(t, 0.002, 0.09)), i * 0.07])));

console.log('Wrote sounds to', OUT, fs.readdirSync(OUT));
