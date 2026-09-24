// Browser smoke test: loads index.html from disk, clicks Start, visits every
// section, takes screenshots and fails on any console error.
//   NODE_PATH=$(npm root -g) node tools/check.mjs [desktop|mobile|both] [secondsPerSection]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, 'out');
mkdirSync(out, { recursive: true });
const which = process.argv[2] || 'both';
const per = Number(process.argv[3] || 3.5);
const url = pathToFileURL(path.join(here, '..', 'index.html')).href + '?seed=7&hq=1';

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
let failures = 0;

async function run(name, viewport, mobile) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
  const problems = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await page.goto(url);
  await page.screenshot({ path: path.join(out, `${name}-00-warning.png`) });
  await page.click('#startBtn');
  for (let s = 0; s < 8; s++) {
    await page.waitForTimeout(per * 1000);
    await page.screenshot({ path: path.join(out, `${name}-${String(s + 1).padStart(2, '0')}.png`) });
    if (s < 7) await page.keyboard.press('ArrowRight');
  }
  // stop must silence and suspend immediately
  await page.keyboard.press('Escape');
  const state = await page.evaluate(() => new Promise((r) => setTimeout(() => r(document.getElementById('btnStop').textContent), 200)));
  const fps = await page.evaluate(() => new Promise((r) => {
    let n = 0; const t0 = performance.now();
    const f = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(f); else r(n); };
    requestAnimationFrame(f);
  }));
  console.log(`[${name}] stop button after Esc: "${state.trim()}", idle rAF/s ${fps}`);
  if (problems.length) { failures++; console.log(`[${name}] PROBLEMS:\n  ` + problems.join('\n  ')); }
  else console.log(`[${name}] no console errors or warnings`);
  await page.close();
}

if (which === 'reduced') {
  // reduced-flashing mode must also start cleanly
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const problems = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(m.text()); });
  page.on('pageerror', (e) => problems.push(e.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(url);
  const checked = await page.isChecked('#reducedToggle');
  await page.click('#startBtn');
  await page.waitForTimeout(per * 1000);
  await page.screenshot({ path: path.join(out, 'reduced-01.png') });
  const label = await page.textContent('#btnFlash');
  console.log(`[reduced] prefers-reduced-motion pre-checks the box: ${checked}; button: "${label}"`);
  console.log(problems.length ? '[reduced] PROBLEMS:\n  ' + problems.join('\n  ') : '[reduced] no console errors or warnings');
  if (problems.length || !checked) failures++;
  await page.close();
}
if (which === 'desktop' || which === 'both') await run('desktop', { width: 1920, height: 1080 }, false);
if (which === 'mobile' || which === 'both') await run('mobile', { width: 390, height: 844 }, true);
await browser.close();
process.exit(failures ? 1 : 0);
