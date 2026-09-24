/* II · ACCELERANDO — the kick speeds up exponentially from 180 to 1000 BPM
 * while the claps and hats keep the 180 BPM grid, so you can hear the kick
 * pull away from the groove. Genre thresholds are announced as they pass. */
'use strict';
(function (X) {
  const T = X.T, Kit = X.Kit;
  const BPM = 180;
  const FROM = T.bpmToHz(180), TO = T.bpmToHz(1000);
  const RAMP_BARS = 12;

  X.SECTIONS = X.SECTIONS || [];
  X.SECTIONS.push({
    id: 'accelerando', num: 2, order: 2, title: 'Accelerando', subtitle: '180 → 1000 BPM',
    hue: 48, bars: 16, bpm: BPM,

    init(api, t) {
      const d = RAMP_BARS * api.barDur;
      const rate = T.expRamp(FROM, TO, t, d);
      api.focus(t, 'kick');
      api.lane('kick', t, { cut: 9000 });
      api.train('kick', t, t + d, { rate, kick: 'gabber' });
      const dbl = T.doublingTime(FROM, TO, d);
      api.stat(t, [`rate(t) = 3 Hz · 2^(t / ${dbl.toFixed(2)} s)`, `tempo doubles every ${dbl.toFixed(2)} s`]);
      Kit.log(api, t + 0.2, `exponential accelerando: the tempo doubles every ${dbl.toFixed(2)} s`);
      for (const [bpm, word, note] of [[300, 'SPEEDCORE', 'speedcore territory: 300+ BPM'], [600, null, '600 BPM: one kick every 100 ms'], [1000, 'EXTRATONE', 'extratone: 1000+ BPM, 16.67 kicks a second']]) {
        const tc = t + T.crossTime(FROM, TO, d, T.bpmToHz(bpm));
        Kit.log(api, tc, note);
        if (word) api.stamp(tc, word, bpm === 300 ? 48 : 78);
      }
      api.fx(t + d - 4 * api.barDur, 'riser', 4 * api.barDur, 0.7, { from: 300, to: 9000 });
      return { riff: api.rng.pick(Kit.RIFFS), gates: api.rng.pick([
        ['xxxxxxxxxxxx....', 'xxxxxxxx..xx..xx', 'xxxxxxxxxxxxxxxx', 'xxxx..xxxx..xx..'],
        ['xxxxxx..xxxxxx..', 'xxxxxxxxxxxx.x.x', 'xx..xx..xxxxxxxx', 'xxxxxxxxxxxxxxxx'],
      ]) };
    },

    onBar(st, bar, t, api) {
      if (bar >= RAMP_BARS) {
        // arrived: 1000 BPM, gated on the 180 grid
        Kit.gate(api, 'kick', t, st.gates[bar - RAMP_BARS], { rate: TO, kick: 'gabber' });
        api.train('bass', t, t + api.barDur, { rate: 4 / api.barDur, kick: 'thud', gain: 0.8 });
      }
      if (bar === RAMP_BARS) api.play(t, 'pad', [Kit.m(45), Kit.m(52), Kit.m(57), Kit.m(64)], api.barDur * 4, 0.5, { attack: 0.4 });
    },

    onStep(st, bar, step, t, api) {
      Kit.groove(api, step, t, { hats: bar < 8 ? '8th' : '16th', snare: true, level: 0.9 });
      if (bar % 4 === 3 && step >= 8 && step % 2 === 0) api.drum(t, 'snare', 0.35 + step * 0.03);
      if (bar >= 4 && bar < RAMP_BARS) Kit.riff(api, (bar % 2) * 16 + step, t, st.riff, 'hoover', 0.9, 0.5);
      if (bar >= RAMP_BARS) Kit.riff(api, (bar % 2) * 16 + step, t, st.riff, 'hoover', 0.9, 0.62, { bend: -1200 });
    },
  });
})(window.FP);
