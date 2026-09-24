/* VI · RISSET — an "eternal accelerando". Five kick lanes an octave of tempo
 * apart all speed up together, doubling every two bars. Each lane fades in
 * at the bottom and out at the top of a bell curve, and when it leaves the
 * top it quietly re-enters at the bottom. Their phases are locked (lane k+1
 * fires exactly twice per kick of lane k), so the texture never stumbles:
 * the tempo seems to rise forever and never arrives. */
'use strict';
(function (X) {
  const T = X.T, Kit = X.Kit, U = X.U;
  const BPM = 180;
  const N = 5;                // layers
  const R0 = 1.5;             // Hz at the bottom of the bell (90 BPM)
  const PD_BARS = 2;          // bars per doubling

  X.SECTIONS = X.SECTIONS || [];
  X.SECTIONS.push({
    id: 'risset', num: 6, order: 6, title: 'Risset', subtitle: 'the eternal accelerando',
    hue: 150, bars: 16, bpm: BPM,

    init(api, t) {
      const pd = PD_BARS * api.barDur;
      const A = (R0 * pd) / Math.LN2; // Φ(t) = A · 2^x has rate R0 · 2^x
      const end = t + api.secDur;
      for (let k = 0; k < N; k++) {
        const lane = 'r' + k;
        const x = (tt) => U.mod(k + (tt - t) / pd, N);
        api.lane(lane, t, { pan: (k - 2) * 0.3, cut: 8000, level: 0.9 });
        api.train(lane, t, end - api.barDur, {
          phase: (tt) => A * Math.pow(2, x(tt)),
          gain: (tt) => Math.pow(Math.sin((Math.PI * x(tt)) / N), 2),
          kick: k % 2 ? 'punch' : 'gabber', fadeIn: 0.25, fadeOut: 0.3,
        });
      }
      api.focus(t, 'r2', { risset: { t0: t, pd, n: N, r0: R0 } });
      const lo = T.group(T.hzToBpm(R0)), hi = T.group(T.hzToBpm(R0 * Math.pow(2, N)));
      api.stat(t, [`${N} layers, ${lo} → ${hi} BPM`, `each doubles every ${pd.toFixed(2)} s`]);
      Kit.log(api, t + 0.2, 'Risset rhythm: the tempo seems to rise forever and never arrives');
      Kit.log(api, t + 2 * api.barDur, `${N} phase-locked lanes, each one doubling every ${pd.toFixed(2)} s`);
      Kit.log(api, t + 5 * api.barDur, 'loudest in the middle, silent at both ends: a bell curve over 5 octaves of tempo');
      Kit.log(api, t + 9 * api.barDur, 'the tempo version of the Shepard–Risset glissando');
      api.play(t, 'pad', [Kit.m(45), Kit.m(52), Kit.m(59), Kit.m(64)], api.secDur - api.barDur, 0.4, { attack: 2, cut: 1200 });
      return {};
    },

    onBar(st, bar, t, api) {
      if (bar === 15) {
        api.fx(t, 'sweepDown', api.barDur, 0.7);
        Kit.log(api, t, 'stop.');
      }
    },

    onStep(st, bar, step, t, api) {
      if (bar >= 15) return;
      if (bar >= 4 && (step === 4 || step === 12)) api.drum(t, 'clap', 0.6);
      if (step % 4 === 2) api.drum(t, 'hat', 0.5, { open: true, decay: 0.1 });
      if (bar >= 8 && step % 2 === 1) api.drum(t, 'hat', 0.25, { pan: 0.4 });
    },
  });
})(window.FP);
