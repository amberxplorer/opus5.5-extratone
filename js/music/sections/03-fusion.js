/* III · FUSION — gated extratone between 1000 and 2000 BPM, the zone where
 * separate pulses start to fuse into a pitch. A 200 BPM gabber kick keeps
 * the dance-floor grid underneath. */
'use strict';
(function (X) {
  const T = X.T, Kit = X.Kit;
  const BPM = 200;
  const RATES = [1000, 1200, 1500, 2000]; // BPM of the buzz, one per 4-bar phrase

  const GATES = [
    ['xxxx..xxxx..xx..', 'xx.xx.xx.xxxx...', 'xxxxxxxx..xx..xx', 'x.xxx.xxx.xxxxxx'],
    ['xxx.xxx.xxx.xx..', 'xxxxxx..xxxxxx..', 'xx..xx.xxxx..xx.', 'xxxxxxxxxxxx.x.x'],
    ['xx.xxx.xx.xxx.x.', 'xxxxxxx.xx.xxxx.', 'x.x.xxxxx.x.xxxx', 'xxxxxxxx.xxxxxxx'],
  ];
  const LEADS = [
    [81, '-', '-', 79, '-', 76, '-', '-', 74, '-', 76, '-', 72, '-', '-', '-'],
    [76, '-', 79, '-', 81, '-', '-', 83, 84, '-', 83, '-', 81, '-', 79, '-'],
  ];

  X.SECTIONS = X.SECTIONS || [];
  X.SECTIONS.push({
    id: 'fusion', num: 3, order: 3, title: 'Fusion', subtitle: 'where pulses become a pitch',
    hue: 190, bars: 16, bpm: BPM,

    init(api, t) {
      api.focus(t, 'buzz');
      api.lane('buzz', t, { cut: 7000, pan: 0 });
      api.lane('kick', t, { cut: 5000, level: 0.9 });
      api.stat(t, [`buzz ${RATES[0]} BPM = ${T.fmtHz(T.bpmToHz(RATES[0]))}`, `meta grid ${BPM} BPM`]);
      api.stamp(t + api.barDur * 4, 'FUSION', 190);
      return { gates: api.rng.pick(GATES), lead: api.rng.pick(LEADS), kick: api.rng.pick(['gabber', 'punch']) };
    },

    onBar(st, bar, t, api) {
      const phrase = Math.floor(bar / 4);
      const bpm = RATES[phrase];
      const hz = T.bpmToHz(bpm);
      if (bar % 4 === 0) {
        const lines = [`buzz ${T.group(bpm)} BPM = ${T.fmtHz(hz)}`, `one kick every ${T.fmtMs(hz)}`];
        if (hz >= T.FUSION_HZ) lines.push(`nearest note ${T.noteLabel(hz)}`);
        api.stat(t, lines);
        const msg = [
          `${T.group(bpm)} BPM = ${T.fmtHz(hz)}: still (just about) countable`,
          `${T.group(bpm)} BPM = ${T.fmtHz(hz)}: around here pulses start to fuse into one pitch`,
          `${T.group(bpm)} BPM = ${T.fmtHz(hz)}: a low buzz, not a rhythm any more`,
          `${T.group(bpm)} BPM = ${T.fmtHz(hz)} ≈ ${T.noteLabel(hz)}`,
        ][phrase];
        Kit.log(api, t, msg);
      }
      Kit.gate(api, 'buzz', t, st.gates[bar % 4], { rate: hz, kick: st.kick, gain: 0.95 });
      Kit.fourFloor(api, t, { kick: 'gabber', gain: 0.75 });
      if (bar === 8) Kit.log(api, t, 'every gate restarts the train: the buzz plays the rhythm');
      if (bar === 15) Kit.snareRoll(api, t + api.barDur / 2, api.barDur / 2, 8, 24, 0.6);
    },

    onStep(st, bar, step, t, api) {
      Kit.groove(api, step, t, { hats: '16th', snare: bar >= 4, level: 0.85 });
      if (bar >= 8) {
        const n = st.lead[step];
        if (n != null && n !== '-') {
          let len = 1;
          while (step + len < 16 && st.lead[step + len] === '-') len++;
          api.play(t, 'screech', [Kit.m(n)], len * api.stepDur * 0.95, 0.75, { pan: 0.1 });
        }
      }
      if (step === 0 && bar % 4 === 0) api.play(t, 'hoover', [Kit.m(57), Kit.m(64)], api.barDur * 0.9, 0.5);
    },
  });
})(window.FP);
