/* IV · EVERY NOTE IS A TEMPO — the bass and the lead are kick trains whose
 * rates are whole-number multiples of 1650 BPM (A0 = 27.5 Hz). So the
 * melody lives on the harmonic series: ×7, ×11 and ×13 are the famously
 * "out of tune" harmonics, and you hear them here as tempos. */
'use strict';
(function (X) {
  const T = X.T, Kit = X.Kit;
  const BPM = 180;
  const BASE = Kit.A0;

  const BASSLINES = [
    [[2, 2], [2, 6], [3, 10], [2, 14]],
    [[2, 2], [4, 6], [2, 10], [3, 14]],
    [[2, 2], [2, 6], [4, 10], [3, 12], [2, 14]],
  ];
  // Lead phrases on harmonics 8..16 (null = rest, '-' = hold), 2 bars each.
  const LEADS = [
    [8, '-', 10, '-', 12, '-', '-', 14, '-', '-', 12, '-', 11, '-', 10, '-', 9, '-', 10, '-', 12, '-', '-', 13, '-', '-', 12, '-', 10, '-', '-', '-'],
    [16, '-', 14, '-', 12, '-', 11, '-', 12, '-', '-', 14, '-', '-', 12, 11, 10, '-', 11, '-', 12, '-', 14, '-', 15, '-', '-', 16, '-', '-', '-', null],
    [12, '-', '-', 11, '-', '-', 10, '-', 12, '-', '-', 14, '-', '-', 13, '-', 12, '-', '-', 11, '-', '-', 10, '-', 9, '-', '-', 8, '-', '-', '-', null],
  ];

  function harmonicNote(n) {
    const hz = n * BASE;
    return `×${n} = ${T.group(T.hzToBpm(hz))} BPM = ${T.fmtHz(hz)} ≈ ${T.noteLabel(hz)}`;
  }

  X.SECTIONS = X.SECTIONS || [];
  X.SECTIONS.push({
    id: 'harmonics', num: 4, order: 4, title: 'Every note is a tempo', subtitle: 'the harmonic series of 1650 BPM',
    hue: 330, bars: 16, bpm: BPM,

    init(api, t) {
      api.focus(t, 'bass');
      api.lane('bass', t, { cut: 3200, q: 1.2, level: 0.95 });
      api.lane('lead', t, { cut: 6000, pan: 0.15, level: 0.8 });
      api.lane('kick', t, { cut: 7000 });
      api.stat(t, [`base: A0 = ${T.fmtHz(BASE)} = ${T.group(T.hzToBpm(BASE))} BPM`, 'every pitch = n × base']);
      Kit.log(api, t + 0.2, `every note here is a whole-number multiple of ${T.group(T.hzToBpm(BASE))} BPM`);
      return { bass: api.rng.pick(BASSLINES), lead: api.rng.pick(LEADS), seen: new Set() };
    },

    onBar(st, bar, t, api) {
      const sd = api.stepDur;
      if (bar < 15) Kit.fourFloor(api, t, { gain: 0.9 });
      else Kit.kicksOn(api, t, [0, 1]);
      for (const [n, s] of st.bass) {
        const nn = bar % 4 === 3 && s === 14 ? n * 2 : n;
        api.train('bass', t + s * sd, t + (s + 2) * sd, { rate: nn * BASE, kick: 'punch', gain: 0.95 });
      }
      if (bar === 4) { api.focus(t, 'lead'); Kit.log(api, t, 'the lead is a kick train too: harmonics 8 to 16'); }
      if (bar === 12) {
        api.play(t, 'hoover', [8 * BASE, 10 * BASE, 12 * BASE], api.barDur * 3.8, 0.5);
        api.chord(t, { label: '8 : 10 : 12', sub: 'a just major triad on A3', rates: [8, 10, 12].map((n) => n * BASE) });
      }
      if (bar === 15) Kit.snareRoll(api, t + api.barDur / 2, api.barDur / 2, 6, 30, 0.55);
    },

    onStep(st, bar, step, t, api) {
      Kit.groove(api, step, t, { hats: bar >= 8 ? '16th' : '8th', snare: bar >= 8, level: 0.8 });
      if (step % 4 === 0 && bar < 15) api.duck(t, 0.45, 0.11);
      if (bar < 4 || bar >= 15) return;
      const i = (bar % 2) * 16 + step;
      const n = st.lead[i];
      if (n == null || n === '-') return;
      let len = 1;
      while (i + len < st.lead.length && st.lead[i + len] === '-') len++;
      const hz = n * BASE;
      api.train('lead', t, t + len * api.stepDur, { rate: hz, kick: 'thud', gain: 0.9, fadeOut: 0.012 });
      api.event(t, 'label', { text: `×${n}`, sub: `${T.group(T.hzToBpm(hz))} BPM` });
      if (!st.seen.has(n) && (n === 7 || n === 11 || n === 13 || n === 14)) {
        st.seen.add(n);
        const cents = T.noteOf(hz).cents;
        Kit.log(api, t, `${harmonicNote(n)}: ${Math.abs(cents).toFixed(0)}¢ ${cents < 0 ? 'flat of' : 'sharp of'} 12-TET`);
      }
    },
  });
})(window.FP);
