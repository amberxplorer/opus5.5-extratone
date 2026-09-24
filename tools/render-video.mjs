// Renders the whole piece to an MP4 (H.264 + AAC) frame by frame, fully
// offline, so it is smooth regardless of how fast the machine draws.
//   NODE_PATH=$(npm root -g) node tools/render-video.mjs [seed] [fps] [width] [height] [maxFrames]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, 'out');
mkdirSync(out, { recursive: true });
const [seed = 7, fps = 30, W = 1920, H = 1080, maxFrames = 0] = process.argv.slice(2).map(Number);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const problems = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(m.text()); });
page.on('pageerror', (e) => problems.push(e.message));
await page.goto(pathToFileURL(path.join(here, '..', 'index.html')).href + '?hq=1');
await page.addScriptTag({ path: path.join(here, 'video-driver.js') });

const t0 = Date.now();
const info = await page.evaluate(([s, f]) => window.XV.prepare(s, f), [seed, fps]);
console.log(`audio rendered in ${((Date.now() - t0) / 1000).toFixed(1)}s: ${info.duration.toFixed(2)}s, ${info.frames} frames, ${info.events} events`);
if (info.errors.length) console.log('ERRORS:\n' + info.errors.join('\n'));
const wavPath = path.join(out, `video-${seed}.wav`);
writeFileSync(wavPath, Buffer.from(await page.evaluate(() => window.XV.wav()), 'base64'));

const frames = maxFrames > 0 ? Math.min(maxFrames, info.frames) : info.frames;
const mp4 = path.join(out, maxFrames > 0 ? `fusionpoint-preview-${seed}.mp4` : `fusionpoint-${seed}.mp4`);
const ff = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y',
  '-f', 'image2pipe', '-framerate', String(fps), '-i', '-',
  '-i', wavPath,
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '256k', '-shortest', '-movflags', '+faststart', mp4], { stdio: ['pipe', 'inherit', 'inherit'] });

const t1 = Date.now();
for (let i = 0; i < frames; i++) {
  await page.evaluate((k) => window.XV.frame(k), i);
  const jpg = await page.screenshot({ type: 'jpeg', quality: 92 });
  if (!ff.stdin.write(jpg)) await once(ff.stdin, 'drain');
  if (i % 300 === 0) {
    const el = (Date.now() - t1) / 1000;
    console.log(`frame ${i}/${frames} · ${el.toFixed(0)}s elapsed · ${(el / Math.max(1, i) * (frames - i) / 60).toFixed(1)} min left`);
  }
}
ff.stdin.end();
await once(ff, 'close');
await browser.close();
console.log(`wrote ${mp4} in ${((Date.now() - t1) / 60000).toFixed(1)} min`);
if (problems.length) console.log('console problems:\n ' + problems.join('\n '));
