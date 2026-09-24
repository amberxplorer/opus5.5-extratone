/* VII · KONTAKTE — the move in reverse: a 440 Hz tone (a kick train at
 * 26 400 BPM) glides down until it falls apart into separate pulses.
 * Then a snare train accelerates into the finale. */
'use strict';
(function (X) {
  const T = X.T, Kit = X.Kit;
  const BPM = 120;
  const FROM = 440, TO = 2;
  const GLIDE_BARS = 6;

  X.SECTIONS = X.SECTIONS || [];
  X.SECTIONS.push({
    id: 'kontakte', num: 7, order: 7, title: 'Kontakte', subtitle: 'a pitch slows down into pulses',
    hue: 18, bars: 8, bpm: BPM,

    init(api, t) {
      const d = GLIDE_BARS * api.barDur;
      api.focus(t, 'tone');
      api.lane('tone', t, { cut: 6500, level: 0.95 });
      api.train('tone', t, t + d + api.barDur, { rate: T.expRamp(FROM, TO, t, d), kick: 'thud', gain: 0.95, fadeIn: 0.05 });
      api.stat(t, [`${T.fmtHz(FROM)} → ${T.fmtHz(TO)}`, `${T.group(T.hzToBpm(FROM))} → ${T.group(T.hzToBpm(TO))} BPM`]);
      Kit.log(api, t + 0.1, `A4 = ${T.fmtHz(FROM)} = ${T.group(T.hzToBpm(FROM))} BPM, gliding down`);
      Kit.log(api, t + api.barDur, "Stockhausen, Kontakte (1958–60): a tone slows down into pulses");
      Kit.log(api, t + 2 * api.barDur, "'…wie die Zeit vergeht…' (1957): pitch and rhythm as one time continuum");
      const tf = t + T.crossTime(FROM, TO, d, T.FUSION_HZ);
      Kit.log(api, tf, `≈${T.FUSION_HZ} Hz: the pitch comes apart into pulses`);
      api.stamp(tf, 'UNFUSE', 18);
      Kit.log(api, t + d, `${T.fmtHz(TO)} = ${T.group(T.hzToBpm(TO))} BPM: a beat again`);
      api.play(t, 'pad', [Kit.m(57), Kit.m(64), Kit.m(69)], d, 0.35, { attack: 1.5, cut: 1800 });
      return {};
    },

    onBar(st, bar, t, api) {
      if (bar === GLIDE_BARS) {
        api.fx(t, 'riser', api.barDur * 2, 0.8, { from: 250, to: 10000 });
        api.focus(t, 'snr');
        Kit.snareRoll(api, t, api.barDur * 2 - api.stepDur * 2, 2, 40, 0.75);
        Kit.log(api, t, 'snare train: 120 → 2400 BPM');
      }
    },

    onStep(st, bar, step, t, api) {
      if (bar >= 2 && bar < GLIDE_BARS && step % 8 === 4) api.drum(t, 'hat', 0.3, { open: true, decay: 0.2 });
    },
  });
})(window.FP);
