/* FUSION POINT — shared composition helpers: patterns, grooves, gated
 * trains, riffs. Pitches in this file are Hz (or MIDI numbers converted with
 * T.midiToHz), because in this piece every pitch is also a tempo. */
'use strict';
(function (X) {
  const T = X.T;
  const Kit = {};

  Kit.A0 = 27.5; // 1650 BPM
  Kit.m = T.midiToHz;

  // "x..x..x." → [1,0,0,1,...]; X = accent (2)
  Kit.pat = (s) => s.replace(/\s+/g, '').split('').map((ch) => (ch === 'X' ? 2 : ch === 'x' ? 1 : 0));

  // Runs of on-steps in a pattern → [[startStep, endStepExclusive], ...]
  Kit.runs = (steps) => {
    const out = [];
    let i = 0;
    while (i < steps.length) {
      if (!steps[i]) { i++; continue; }
      let j = i + 1;
      while (j < steps.length && steps[j] === 1) j++; // an accent starts a new run
      out.push([i, j]);
      i = j;
    }
    return out;
  };

  // A gated kick train over one bar. Each run of steps is one segment, so the
  // train restarts (kick on the first sample) at every gate opening.
  Kit.gate = (api, lane, t, pattern, spec) => {
    const sd = api.stepDur;
    const steps = typeof pattern === 'string' ? Kit.pat(pattern) : pattern;
    for (const [a, b] of Kit.runs(steps)) api.train(lane, t + a * sd, t + b * sd, spec);
  };

  // Four-on-the-floor on the kick lane for one bar (rate = 4 per bar).
  Kit.fourFloor = (api, t, spec = {}) => {
    api.train('kick', t, t + api.barDur, Object.assign({ rate: 4 / api.barDur, kick: 'gabber' }, spec));
  };
  // Kicks on selected quarter notes only.
  Kit.kicksOn = (api, t, beats, spec = {}) => {
    const bd = api.beatDur;
    for (const b of beats) api.train('kick', t + b * bd, t + (b + 1) * bd, Object.assign({ rate: 1 / bd, kick: 'gabber' }, spec));
  };

  // Standard hardcore top end, called every step.
  Kit.groove = (api, step, t, o = {}) => {
    const lvl = o.level != null ? o.level : 1;
    if (o.clap !== false && (step === 4 || step === 12)) {
      api.drum(t, 'clap', 0.9 * lvl);
      if (o.snare) api.drum(t, 'snare', 0.7 * lvl, { drive: 0.4 });
    }
    if (o.hats === '8th' && step % 2 === 0) api.drum(t, 'hat', (step % 4 === 2 ? 0.9 : 0.45) * lvl, { pan: 0.25 });
    if (o.hats === '16th') api.drum(t, 'hat', (step % 4 === 2 ? 0.8 : step % 2 ? 0.3 : 0.45) * lvl, { pan: step % 2 ? -0.3 : 0.3 });
    if (o.hats === 'off' && step % 4 === 2) api.drum(t, 'hat', 0.85 * lvl, { open: true, decay: 0.12 });
    if (o.ride && step % 4 === 0) api.drum(t, 'metal', 0.5 * lvl, { freq: 610, decay: 0.12, pan: -0.2 });
  };

  // An accelerating snare roll as a kick-train lane of snares.
  Kit.snareRoll = (api, t, dur, fromHz, toHz, gain = 0.7) => {
    api.train('snr', t, t + dur, {
      kick: 'snare', rate: T.expRamp(fromHz, toHz, t, dur),
      gain: (tt) => gain * (0.35 + 0.65 * Math.min(1, (tt - t) / dur)), fadeOut: 0.01,
    });
  };

  // A riff: array of 16 MIDI numbers (or null) per bar.
  Kit.riff = (api, step, t, notes, inst, dur, vel = 0.8, p = {}) => {
    const n = notes[step];
    if (n == null) return;
    let len = 1;
    while (step + len < notes.length && notes[step + len] === '-') len++;
    if (n === '-') return;
    api.play(t, inst, [Kit.m(n)], len * api.stepDur * (dur || 0.9), vel, p);
  };

  // Gabber / rave riffs in A minor, two bars each (32 steps).
  const _ = null, H = '-';
  Kit.RIFFS = [
    [57, _, 57, _, 60, _, 57, H, 64, _, 62, _, 60, _, 59, _, 57, _, 57, _, 60, _, 64, H, 65, _, 64, _, 62, _, 60, _],
    [57, H, _, 57, H, _, 60, _, 57, H, _, 55, H, _, 52, _, 57, H, _, 57, H, _, 64, _, 62, H, _, 60, H, _, 59, _],
    [69, _, 64, _, 60, _, 64, _, 69, _, 64, _, 60, _, 71, 72, 69, _, 64, _, 60, _, 64, _, 67, _, 65, _, 64, _, 62, _],
  ];

  Kit.log = (api, t, text, hue) => api.text(t, text, { hue });

  X.Kit = Kit;
})(window.FP);
