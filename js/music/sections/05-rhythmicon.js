/* V · RHYTHMICON — a 4:5:6:7 polyrhythm at human speed, then the same
 * ratios sped up 64 times until the polyrhythm *is* a chord. Afterwards
 * the lanes play a just-intonation progression, one tempo per voice. */
'use strict';
(function (X) {
  const T = X.T, Kit = X.Kit, U = X.U;
  const BPM = 120;
  const BASE = 0.5;             // Hz: 30 BPM, one cycle per bar
  const RATIOS = [4, 5, 6, 7];
  const LANES = ['a', 'b', 'c', 'd'];
  const PANS = [-0.55, -0.18, 0.18, 0.55];
  const KICKS = ['punch', 'thud', 'punch', 'thud'];
  const SPEEDUP = 64;           // 6 octaves
  const SLOW_BARS = 4, RAMP_BARS = 4;

  // Chords for the progression: rates in Hz, all small-integer ratios.
  const CHORDS = [
    { rates: [128, 160, 192, 224], name: 'harmonic seventh' },
    { rates: [128 * 4 / 3, 160 * 4 / 3, 192 * 4 / 3, 224 * 4 / 3], name: 'harmonic seventh, up a 4/3' },
    { rates: [320 / 3, 128, 160, 192], name: 'just minor seventh' },
    { rates: [144, 180, 216, 252], name: 'harmonic seventh, up a 9/8' },
  ];

  X.SECTIONS = X.SECTIONS || [];
  X.SECTIONS.push({
    id: 'rhythmicon', num: 5, order: 5, title: 'Rhythmicon', subtitle: 'a polyrhythm, 64× faster, is a chord',
    hue: 280, bars: 12, bpm: BPM,

    init(api, t) {
      const bar = api.barDur;
      const tr = t + SLOW_BARS * bar, dr = RAMP_BARS * bar;
      const mult = (tt) => (tt < tr ? 1 : Math.pow(SPEEDUP, U.clamp((tt - tr) / dr, 0, 1)));
      api.focus(t, 'a');
      RATIOS.forEach((r, i) => {
        const lane = LANES[i];
        api.lane(lane, t, { pan: PANS[i], cut: 5500, level: 0.8 });
        // lane d (the 7) joins at bar 2
        const t0 = i === 3 ? t + 2 * bar : t;
        const hz0 = BASE * r;
        // One tied pair of segments per lane: the phases of all lanes stay
        // locked because the rate multiplier is shared.
        api.train(lane, t0, tr + dr, {
          rate: (tt) => hz0 * mult(tt), kick: KICKS[i],
          gain: 0.95,
        });
      });
      const bpms = RATIOS.slice(0, 3).map((r) => T.group(T.hzToBpm(BASE * r))).join(' : ');
      api.stat(t, [`4 : 5 : 6 of ${T.group(T.hzToBpm(BASE))} BPM`, `= ${bpms} BPM`]);
      Kit.log(api, t + 0.2, `three kick lanes at ${bpms} BPM: a 4 : 5 : 6 polyrhythm`);
      Kit.log(api, t + bar * 1, 'Rhythmicon (Cowell & Theremin, 1931): polyrhythms from the overtone series');
      Kit.log(api, t + bar * 2, `+ 7: ${T.group(T.hzToBpm(BASE * 7))} BPM`);
      Kit.log(api, tr, `now ×${SPEEDUP}, six doublings in ${dr.toFixed(0)} s`);
      const top = RATIOS.map((r) => BASE * r * SPEEDUP);
      api.event(tr + dr, 'label', { text: '4 : 5 : 6 : 7', sub: top.map((h) => T.fmtHz(h)).join(' · ') });
      api.chord(tr + dr, { label: T.ratioLabel(top), sub: 'harmonic seventh chord', rates: top });
      Kit.log(api, tr + dr, `${top.map((h) => T.group(T.hzToBpm(h))).join(' : ')} BPM = ${top.map((h) => h.toFixed(0)).join(' : ')} Hz`);
      const sev = T.ratioCents(7 / 4);
      Kit.log(api, tr + dr + bar, `the same 4 : 5 : 6 : 7, now a chord · 7/4 = ${sev.toFixed(1)}¢ (12-TET: 1000¢)`);
      api.fx(tr, 'riser', dr, 0.55, { from: 200, to: 6000 });
      api.play(t, 'pad', [Kit.m(48), Kit.m(55)], bar * 8, 0.35, { attack: 3, cut: 900 });
      return { prog: [0].concat(api.rng.shuffle([1, 2, 3])), tp: tr + dr };
    },

    onBar(st, bar, t, api) {
      if (bar < SLOW_BARS + RAMP_BARS) return;
      const k = bar - SLOW_BARS - RAMP_BARS;
      const ch = CHORDS[st.prog[k]];
      const bd = api.beatDur;
      ch.rates.forEach((hz, i) => {
        // retriggered on every beat so the chord pumps with the groove
        for (let b = 0; b < 4; b++) {
          api.train(LANES[i], t + b * bd, t + (b + 0.85) * bd, { rate: hz, kick: KICKS[i], gain: 0.9, fadeOut: 0.03 });
        }
      });
      if (k > 0) {
        api.chord(t, { label: T.ratioLabel(ch.rates), sub: ch.name, rates: ch.rates });
        api.event(t, 'label', { text: T.ratioLabel(ch.rates), sub: ch.rates.map((h) => T.fmtHz(h)).join(' · ') });
      }
      api.train('kick', t, t + api.barDur, { rate: 8 / api.barDur, kick: 'gabber', gain: 0.7 });
      api.play(t, 'hoover', ch.rates.slice(0, 3).map((h) => h * 2), api.barDur * 0.95, 0.4);
      if (bar === 11) Kit.snareRoll(api, t + api.barDur / 2, api.barDur / 2, 8, 32, 0.6);
    },

    onStep(st, bar, step, t, api) {
      if (bar < SLOW_BARS) {
        if (step % 4 === 0) api.drum(t, 'hat', 0.5, { pan: -0.4 });
        return;
      }
      if (bar < SLOW_BARS + RAMP_BARS) {
        if (bar >= SLOW_BARS + 2 && step % 2 === 0) api.drum(t, 'hat', 0.25 + 0.03 * step);
        return;
      }
      Kit.groove(api, step, t, { hats: '16th', snare: true, level: 0.85 });
      if (step % 2 === 0) api.duck(t, 0.4, 0.08);
    },
  });
})(window.FP);
