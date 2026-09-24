// Offline audio render of every section: levels, clipping, NaNs, errors,
// plus a WAV and a spectrogram per section in tools/out/.
//   NODE_PATH=$(npm root -g) node tools/render-audio.mjs [sectionIndex|all] [seed]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, 'out');
mkdirSync(out, { recursive: true });

const which = process.argv[2] || 'all';
const seed = Number(process.argv[3] || 12345);
const mute = (process.argv[4] || '').split(',').filter(Boolean); // e.g. kicks,music

const browser = await chromium.launch();
const page = await browser.newPage();
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
await page.goto(pathToFileURL(path.join(here, 'render.html')).href);
await page.waitForFunction(() => window.READY === true);
const durs = await page.evaluate(() => window.durations());
console.log('section durations:', durs.map((d) => `${d.id} ${d.seconds}s`).join(' | '),
  '| total', durs.reduce((s, d) => s + d.seconds, 0).toFixed(1) + 's');

if (which === 'full') {
  // The whole piece in one continuous render, plus an MP3 to listen to.
  const res = await page.evaluate(([s]) => window.render(0, 8, s, true), [seed]);
  writeFileSync(path.join(out, 'fusionpoint-full.wav'), Buffer.from(res.wav, 'base64'));
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', path.join(out, 'fusionpoint-full.wav'),
    '-codec:a', 'libmp3lame', '-b:a', '256k', path.join(out, 'fusionpoint-full.mp3')]);
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', path.join(out, 'fusionpoint-full.wav'),
    '-lavfi', 'showspectrumpic=s=1800x500:legend=1:scale=log:fscale=log', path.join(out, 'fusionpoint-full-spec.png')]);
  delete res.wav;
  console.log(`[full] ${res.seconds}s peak ${res.peak} rms ${res.rmsDb} dB nan ${res.nan} hot ${res.hot}`);
  console.log('  events:', JSON.stringify(res.counts));
  if (res.errors.length) console.log('  ERRORS:\n   ' + res.errors.join('\n   '));
  if (logs.length) console.log('\nconsole:\n ' + logs.join('\n '));
  await browser.close();
  process.exit(res.errors.length ? 1 : 0);
}
const list = which === 'all' ? durs.map((_, i) => i) : [Number(which)];
for (const i of list) {
  const res = await page.evaluate(([a, s, m]) => window.render(a, a + 1, s, true, false, m), [i, seed, mute]);
  const name = `${String(i + 1).padStart(2, '0')}-${durs[i].id}`;
  if (res.wav) writeFileSync(path.join(out, name + '.wav'), Buffer.from(res.wav, 'base64'));
  try {
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', path.join(out, name + '.wav'),
      '-lavfi', 'showspectrumpic=s=1200x400:legend=1:scale=log:fscale=log', path.join(out, name + '-spec.png')]);
  } catch (e) { logs.push('ffmpeg: ' + e.message); }
  delete res.wav;
  const quiet = res.perSec.filter(([db]) => db < -40).length;
  console.log(`\n[${name}] ${res.seconds}s (${(res.seconds / res.wall).toFixed(1)}× realtime) peak ${res.peak} rms ${res.rmsDb} dB nan ${res.nan} hot ${res.hot} quietSecs ${quiet}`);
  console.log('  per-second rms/peak:', res.perSec.map(([d, p]) => `${d}/${p}`).join(' '));
  console.log('  events:', JSON.stringify(res.counts));
  if (res.errors.length) console.log('  ERRORS:\n   ' + res.errors.join('\n   '));
}
if (logs.length) console.log('\nconsole:\n ' + logs.join('\n '));
await browser.close();
