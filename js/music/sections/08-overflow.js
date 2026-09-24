/* VIII · OVERFLOW — everything at once: a 200 BPM gabber kick, a gated
 * extratone buzz, a harmonic-series bassline, kick-train chords, and at the
 * end every lane accelerating together until the tempo leaves the ladder. */
'use strict';
(function (X) {
  const T = X.T, Kit = X.Kit;
  const BPM = 200;
  const BASE = Kit.A0;
  const BARS = 28;
  const RAMP_FROM = 24;         // last 4 bars: everything accelerates
  const RAMP_MULT = 8;          // three octaves

  const GATES = [
    ['xxxxxx..xxxx..xx', 'xx.xx.xxxxxxxx..', 'xxxxxxxx.x.xxxxx', 'xxx.xxx.xxxxxxxx'],
    ['xxxx.xxxxx.xxx..', 'xxxxxxxx..xxxx..', 'x.xxxxx.xxx.xxxx', 'xxxxxxxxxxxx....'],
  ];
  const BASS = [[2, 2], [2, 6], [3, 10], [4, 12], [2, 14]];
  // chord lanes: 4:5:6 just triads on A (×8), D (×32/3) and E (×6) of A0
  const PROG = [[8, 10, 12], [8, 10, 12], [32 / 3, 40 / 3, 16], [6, 7.5, 9]];
  const LEAD = [16, '-', 15, '-', 12, '-', '-', 10, '-', '-', 12, '-', 15, '-', 16, '-', 18, '-', 16, '-', 15, '-', '-', 12, '-', '-', 10, '-', 12, '-', '-', '-'];

  X.SECTIONS = X.SECTIONS || [];
  X.SECTIONS.push({
    id: 'overflow', num: 8, order: 8, title: 'Overflow', subtitle: 'everything, faster',
    hue: 300, bars: BARS, bpm: BPM,

    init(api, t) {
      api.focus(t, 'buzz');
      api.lane('buzz', t, { cut: 6500 });
      api.lane('bass', t, { cut: 2600, q: 1.3, level: 0.9 });
      api.lane('lead', t, { cut: 6000, pan: -0.15, level: 0.75 });
      ['a', 'b', 'c'].forEach((l, i) => api.lane(l, t, { pan: (i - 1) * 0.5, cut: 4200, level: 0.6 }));
      api.stamp(t, 'OVERFLOW', 300);
      api.flash(t, 0.8);
      Kit.log(api, t, 'kick 200 BPM · buzz 1 500–2 400 BPM · bass and chords are tempos too');
      api.stat(t, [`kick ${BPM} BPM = ${T.fmtHz(T.bpmToHz(BPM))}`, `buzz up to ${T.group(2400)} BPM = ${T.fmtHz(40)}`]);
      return { gates: api.rng.pick(GATES), buzz: api.rng.pick([1500, 1800, 2000]) };
    },

    onBar(st, bar, t, api) {
      const sd = api.stepDur, bar0 = api.barDur;
      if (bar < RAMP_FROM) {
        // --- the drop
        if (bar % 8 === 7) Kit.kicksOn(api, t, [0, 1, 2]);
        else Kit.fourFloor(api, t);
        const bpm = bar % 8 >= 4 ? 2400 : st.buzz;
        Kit.gate(api, 'buzz', t, st.gates[bar % 4], { rate: T.bpmToHz(bpm), kick: 'gabber', gain: 0.85 });
        for (const [n, s] of BASS) api.train('bass', t + s * sd, t + (s + 2) * sd, { rate: n * BASE, kick: 'punch', gain: 0.9 });
        if (bar >= 8) {
          const ch = PROG[Math.floor(bar / 2) % 4];
          ch.forEach((n, i) => {
            for (let b = 0; b < 8; b++) {
              api.train(['a', 'b', 'c'][i], t + b * 2 * sd, t + (b * 2 + 1.6) * sd, { rate: n * BASE, kick: 'thud', gain: 0.55, fadeOut: 0.02 });
            }
          });
          if (bar % 2 === 0) api.chord(t, { label: T.ratioLabel(ch.map((n) => n * BASE)), sub: ch.map((n) => T.noteLabel(n * BASE)).join(' · '), rates: ch.map((n) => n * BASE) });
        }
        if (bar === 8) Kit.log(api, t, 'the chords are three more kick trains, gated in 8ths');
        if (bar === 16) { api.focus(t, 'lead'); Kit.log(api, t, 'lead: harmonics 10 to 18 of 1650 BPM'); }
        if (bar % 8 === 7) Kit.snareRoll(api, t + bar0 * 0.5, bar0 * 0.5, 8, 40, 0.6);
      } else if (bar === RAMP_FROM) {
        // --- tempo overflow: every lane ×8 over 4 bars
        const d = 4 * bar0 - sd * 2;
        const up = (hz) => T.expRamp(hz, hz * RAMP_MULT, t, d);
        api.focus(t, 'buzz');
        api.train('kick', t, t + d, { rate: up(T.bpmToHz(BPM)), kick: 'gabber', gain: 0.9 });
        api.train('buzz', t, t + d, { rate: up(T.bpmToHz(st.buzz)), kick: 'gabber', gain: 0.7 });
        api.train('bass', t, t + d, { rate: up(2 * BASE), kick: 'punch', gain: 0.7 });
        [8, 10, 12].forEach((n, i) => api.train(['a', 'b', 'c'][i], t, t + d, { rate: up(n * BASE), kick: 'thud', gain: 0.5, fadeIn: 0.5 }));
        api.fx(t, 'riser', d, 0.8, { from: 300, to: 12000, pitchFrom: 200, pitchTo: 3000 });
        Kit.log(api, t, `all lanes ×${RAMP_MULT}: three octaves of tempo in ${d.toFixed(1)} s`);
        const top = T.bpmToHz(st.buzz) * RAMP_MULT;
        Kit.log(api, t + d * 0.6, `buzz → ${T.group(T.hzToBpm(top))} BPM = ${T.fmtHz(top)}`);
        api.stamp(t + d * 0.75, 'TEMPO OVERFLOW', 300);
        api.stat(t, [`every lane × ${RAMP_MULT}`, `kick ${BPM} → ${T.group(BPM * RAMP_MULT)} BPM`]);
      }
      if (bar === BARS - 1) api.event(t + bar0 - sd * 2, 'finale', {});
    },

    onStep(st, bar, step, t, api) {
      if (bar < RAMP_FROM) {
        Kit.groove(api, step, t, { hats: '16th', snare: true, level: 0.85, ride: bar >= 16 });
        if (step % 4 === 0) api.duck(t, 0.5, 0.1);
        if (bar % 8 < 4 && bar < 16) Kit.riff(api, (bar % 2) * 16 + step, t, Kit.RIFFS[0], 'hoover', 0.9, 0.5);
        if (bar >= 16) {
          const i = (bar % 2) * 16 + step, n = LEAD[i];
          if (n != null && n !== '-') {
            let len = 1;
            while (i + len < LEAD.length && LEAD[i + len] === '-') len++;
            api.train('lead', t, t + len * api.stepDur, { rate: n * BASE, kick: 'zap', gain: 0.8, fadeOut: 0.01 });
            api.event(t, 'label', { text: `×${n}`, sub: `${T.group(T.hzToBpm(n * BASE))} BPM` });
          }
        }
      } else if (step % 4 === 0 && bar < BARS - 1) {
        api.drum(t, 'clap', 0.5 + 0.1 * (bar - RAMP_FROM));
      }
    },

    onExit(st, t, api) {
      api.fx(t, 'impact', 1);
      api.drum(t, 'crash', 1);
      api.flash(t, 1);
    },
  });
})(window.FP);
