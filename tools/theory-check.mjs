// Assertions for every number and claim the piece shows on screen.
//   node tools/theory-check.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ctx = { window: {}, Math, Number, String, Array, Object, Float32Array, Float64Array, console };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['js/core/util.js', 'js/theory/tempo.js', 'js/audio/kicktrain.js', 'js/music/kit.js']) {
  vm.runInContext(readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
}
const { T, Kit, K } = ctx.FP;

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = typeof want === 'number' ? Math.abs(got - want) < 1e-9 : got === want;
  if (ok) pass++; else { fail++; console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
};
const near = (name, got, want, tol) => {
  if (Math.abs(got - want) <= tol) pass++; else { fail++; console.log(`FAIL ${name}: got ${got}, want ${want} ± ${tol}`); }
};

// --- tempo ↔ pitch
eq('180 BPM = 3 Hz', T.bpmToHz(180), 3);
eq('180 BPM period', T.fmtMs(3), '333.3 ms');
eq('1000 BPM = 16.67 Hz', T.fmtHz(T.bpmToHz(1000)), '16.67 Hz');
eq('1000 BPM period', T.fmtMs(T.bpmToHz(1000)), '60.00 ms');
eq('1200 BPM = 20 Hz', T.bpmToHz(1200), 20);
eq('A4 = 26 400 BPM', T.hzToBpm(440), 26400);
eq('A0 = 1650 BPM', T.hzToBpm(Kit.A0), 1650);
eq('A1 = 55 Hz name', T.noteLabel(55), 'A1');
eq('A0 name', T.noteLabel(27.5), 'A0');
eq('grouping', T.group(26400), '26 400');
eq('pitchness below', T.pitchness(14), 0);
eq('pitchness above', T.pitchness(32), 1);
eq('2000 BPM ≈ C1', T.noteLabel(T.bpmToHz(2000)), 'C1 +33¢');

// --- II accelerando: 3 → 16.67 Hz over 12 bars of 180 BPM (16 s)
const d2 = 12 * 4 * 60 / 180;
eq('accel duration', d2, 16);
eq('doubling time', T.doublingTime(3, T.bpmToHz(1000), d2).toFixed(2), '6.47');
near('passes 300 BPM', T.crossTime(3, T.bpmToHz(1000), d2, 5), 4.77, 0.01);

// --- IV harmonic series of A0
const harm = (n) => T.noteLabel(n * Kit.A0);
eq('×7', harm(7), 'G3 −31¢');
eq('×11', harm(11), 'D♯4 −49¢');
eq('×13', harm(13), 'F4 +41¢');
eq('×14', harm(14), 'G4 −31¢');
eq('8:10:12 is 4:5:6', T.ratioLabel([8, 10, 12].map((n) => n * Kit.A0)), '4 : 5 : 6');

// --- V Rhythmicon
eq('4:5:6 of 30 BPM', [4, 5, 6].map((r) => T.hzToBpm(0.5 * r)).join(' : '), '120 : 150 : 180');
eq('×64 in Hz', [4, 5, 6, 7].map((r) => 0.5 * r * 64).join(' : '), '128 : 160 : 192 : 224');
eq('×64 in BPM', [4, 5, 6, 7].map((r) => T.group(T.hzToBpm(0.5 * r * 64))).join(' : '), '7 680 : 9 600 : 11 520 : 13 440');
eq('harmonic 7th chord', T.ratioLabel([128, 160, 192, 224]), '4 : 5 : 6 : 7');
eq('up a 4/3', T.ratioLabel([128, 160, 192, 224].map((h) => h * 4 / 3)), '4 : 5 : 6 : 7');
eq('just minor 7th', T.ratioLabel([320 / 3, 128, 160, 192]), '10 : 12 : 15 : 18');
eq('7/4 in cents', T.ratioCents(7 / 4).toFixed(1), '968.8');
eq('128 Hz name', T.noteLabel(128), 'C3 −38¢');

// --- VI Risset: 5 layers from 90 BPM, doubling every 2 bars of 180 BPM
eq('Risset top', T.hzToBpm(1.5 * 32), 2880);
eq('Risset doubling', (2 * 4 * 60 / 180).toFixed(2), '2.67');

// --- VII Kontakte: 440 → 2 Hz over 6 bars of 120 BPM
eq('2 Hz = 120 BPM', T.hzToBpm(2), 120);
near('unfuse time', T.crossTime(440, 2, 12, 20), 6.87, 0.01);

// --- VIII chords (harmonics of A0)
eq('A chord', T.ratioLabel([8, 10, 12].map((n) => n * Kit.A0)), '4 : 5 : 6');
eq('D chord', T.ratioLabel([32 / 3, 40 / 3, 16].map((n) => n * Kit.A0)), '4 : 5 : 6');
eq('E chord', T.ratioLabel([6, 7.5, 9].map((n) => n * Kit.A0)), '4 : 5 : 6');
eq('overflow top', T.fmtHz(T.bpmToHz(2000) * 8), '266.7 Hz');

// --- kick-train loudness matching quiets fast trains
const tabs = K.makeTables(48000);
eq('slow kick untouched', tabs.gabber.comp(3), 1);
if (tabs.gabber.comp(440) < 0.8) pass++; else { fail++; console.log('FAIL comp(440) should reduce level'); }

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
