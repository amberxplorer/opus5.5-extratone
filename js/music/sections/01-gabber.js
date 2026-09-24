/* I · GABBER — 180 BPM. Establish the kick as a *rhythm* before we start
 * multiplying it: one distorted kick every 333.3 ms. */
'use strict';
(function (X) {
  const T = X.T, Kit = X.Kit;
  const BPM = 180;

  X.SECTIONS = X.SECTIONS || [];
  X.SECTIONS.push({
    id: 'gabber', num: 1, order: 1, title: 'Gabber', subtitle: 'the kick is a rhythm',
    hue: 78, bars: 16, bpm: BPM, impact: false,

    init(api, t) {
      const hz = T.bpmToHz(BPM);
      api.focus(t, 'kick');
      api.lane('kick', t, { cut: 9000, level: 1 });
      api.stat(t, [`${BPM} BPM = ${T.fmtHz(hz)}`, `one kick every ${T.fmtMs(hz)}`]);
      Kit.log(api, t + 0.3, `${BPM} BPM → one kick every ${T.fmtMs(hz)}`);
      return { riff: api.rng.pick(Kit.RIFFS) };
    },

    onBar(st, bar, t, api) {
      const hz = T.bpmToHz(BPM);
      if (bar < 15) Kit.fourFloor(api, t);
      else {
        // fill: 2 → 4 → 8 per beat, then a breath
        const bd = api.beatDur;
        api.train('kick', t, t + bd, { rate: 1 / bd, kick: 'gabber' });
        api.train('kick', t + bd, t + 2 * bd, { rate: 2 / bd, kick: 'gabber' });
        api.train('kick', t + 2 * bd, t + 3 * bd, { rate: 4 / bd, kick: 'gabber' });
        api.fx(t + 2 * bd, 'riser', bd * 2, 0.6, { from: 500, to: 7000 });
      }
      if (bar === 0) api.play(t, 'pad', [Kit.m(45), Kit.m(52), Kit.m(57), Kit.m(60)], api.barDur * 8, 0.5, { attack: 2, cut: 1100 });
      if (bar === 4) Kit.log(api, t, `${BPM} kicks a minute = ${hz.toFixed(2)} kicks a second = ${T.fmtHz(hz)}`);
      if (bar === 8) {
        Kit.log(api, t, 'gabber: Rotterdam, early 1990s, roughly 150–200 BPM');
        api.play(t, 'pad', [Kit.m(45), Kit.m(53), Kit.m(57), Kit.m(60)], api.barDur * 8, 0.55, { attack: 1, cut: 1500 });
      }
      if (bar === 12) Kit.log(api, t, 'now: keep multiplying the tempo');
      if (bar === 14) Kit.log(api, t + api.beatDur, `×2 = ${2 * BPM} · ×4 = ${4 * BPM} BPM`);
    },

    onStep(st, bar, step, t, api) {
      if (bar >= 4 && bar < 15) Kit.groove(api, step, t, { hats: bar >= 8 ? '16th' : 'off', snare: bar >= 8 });
      if (bar >= 8 && bar < 15) Kit.riff(api, (bar % 2) * 16 + step, t, st.riff, 'hoover', 0.9, 0.62);
      if (step % 4 === 0 && bar < 15) api.duck(t, 0.5, 0.12);
    },
  });
})(window.FP);
