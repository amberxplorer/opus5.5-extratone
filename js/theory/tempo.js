/* FUSION POINT — tempo ↔ pitch theory.
 * One number, two names: a pulse train at r Hz is 60·r beats per minute.
 * Every value shown on screen comes from these functions. */
'use strict';
(function (X) {
  const U = X.U;
  const T = {};

  T.A4 = 440;
  T.NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

  T.bpmToHz = (bpm) => bpm / 60;
  T.hzToBpm = (hz) => hz * 60;
  T.periodMs = (hz) => 1000 / hz;
  T.midiToHz = (m) => T.A4 * Math.pow(2, (m - 69) / 12);
  T.hzToMidi = (hz) => 69 + 12 * Math.log2(hz / T.A4);
  T.ratioCents = (r) => 1200 * Math.log2(r);

  // Nearest 12-TET note name plus the deviation in cents: 128 Hz → "C3 −37¢".
  T.noteOf = (hz) => {
    const m = T.hzToMidi(hz);
    const n = Math.round(m);
    const cents = (m - n) * 100;
    const name = T.NAMES[U.mod(n, 12)] + (Math.floor(n / 12) - 1);
    return { midi: n, name, cents };
  };
  T.noteLabel = (hz, digits = 0) => {
    const { name, cents } = T.noteOf(hz);
    const c = Math.round(cents * Math.pow(10, digits)) / Math.pow(10, digits);
    return Math.abs(c) < 0.5 / Math.pow(10, digits) ? name : `${name} ${U.fmtCents(c, digits)}`;
  };

  // Pulses below roughly 20 Hz are heard as separate events; above it they
  // fuse into a pitch. The boundary is gradual, so "pitchness" is a ramp.
  T.FUSION_HZ = 20;
  T.pitchness = (hz) => U.smoothstep(14, 32, hz);

  // Formatting: "26 400" with a thin space, tabular in a monospace font.
  T.group = (n) => {
    const s = String(Math.round(Math.abs(n)));
    return (n < 0 ? U.MINUS : '') + s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  };
  T.fmtBpm = (hz) => T.group(T.hzToBpm(hz));
  T.fmtHz = (hz) => (hz < 100 ? hz.toFixed(2) : hz < 1000 ? hz.toFixed(1) : hz.toFixed(0)) + ' Hz';
  T.fmtMs = (hz) => {
    const ms = T.periodMs(hz);
    return (ms >= 100 ? ms.toFixed(1) : ms >= 10 ? ms.toFixed(2) : ms.toFixed(3)) + ' ms';
  };

  // Exponential ramps: rate(t) = a·(b/a)^(t/d). Doubling time d·ln2/ln(b/a).
  T.expRamp = (a, b, t0, d) => (t) => a * Math.pow(b / a, U.clamp((t - t0) / d, 0, 1));
  T.doublingTime = (a, b, d) => (d * Math.LN2) / Math.log(b / a);
  // When does an exponential ramp a→b over d seconds pass `target`?
  T.crossTime = (a, b, d, target) => (d * Math.log(target / a)) / Math.log(b / a);

  // Landmarks on the tempo ladder. Genre ranges are community conventions,
  // not physics, so they are labelled as approximate.
  T.LANDMARKS = [
    { bpm: 60, label: '60 BPM', note: '1 per second', kind: 'tick' },
    { bpm: 180, label: 'gabber', note: '≈150–200', kind: 'genre' },
    { bpm: 300, label: 'speedcore', note: '300+', kind: 'genre' },
    { bpm: 1000, label: 'extratone', note: '1000+', kind: 'genre' },
    { bpm: 1200, label: '≈20 Hz', note: 'pulse → pitch', kind: 'fusion' },
    { bpm: T.hzToBpm(27.5), label: 'A0', note: '27.5 Hz', kind: 'note' },
    { bpm: T.hzToBpm(55), label: 'A1', note: '55 Hz', kind: 'note' },
    { bpm: T.hzToBpm(110), label: 'A2', note: '110 Hz', kind: 'note' },
    { bpm: T.hzToBpm(220), label: 'A3', note: '220 Hz', kind: 'note' },
    { bpm: T.hzToBpm(440), label: 'A4', note: '440 Hz', kind: 'note' },
  ];
  T.LADDER_MIN = 60;      // BPM at the bottom of the ladder
  T.LADDER_MAX = 36000;   // BPM at the top (600 Hz)

  // Small-integer ratio label for a set of rates: [128,160,192] → "4 : 5 : 6".
  T.ratioLabel = (rates, maxDen = 32) => {
    const base = Math.min(...rates);
    for (let d = 1; d <= maxDen; d++) {
      const ints = rates.map((r) => (r / base) * d);
      if (ints.every((v) => Math.abs(v - Math.round(v)) < 1e-6)) {
        let g = 0;
        for (const v of ints) g = U.gcd(g, Math.round(v));
        return ints.map((v) => Math.round(v) / g).join(' : ');
      }
    }
    return null;
  };

  X.T = T;
})(window.FP);
