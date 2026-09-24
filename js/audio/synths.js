/* FUSION POINT — the non-kick instruments: snares, hats, claps, cymbals,
 * risers, hoover stabs, a screech lead and a pad. Everything is oscillators,
 * generated noise, filters and envelopes. Tonal voices take frequencies in Hz.
 * (The kicks, and every extratone sound, live in kicktrain.js.) */
'use strict';
(function (X) {
  const S = {};

  function panNode(E, v, dest) {
    const p = E.ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, v || 0));
    p.connect(dest);
    return p;
  }
  function shaperTo(E, amount, dest, level = 0.8) {
    const sh = E.ctx.createWaveShaper();
    sh.curve = E.driveCurve(amount);
    const g = E.ctx.createGain();
    g.gain.value = level;
    sh.connect(g);
    g.connect(dest);
    return sh;
  }
  function filter(E, type, freq, q) {
    const f = E.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    if (q != null) f.Q.value = q;
    return f;
  }
  const expDecay = (param, t, peak, dur) => {
    param.setValueAtTime(peak, t);
    param.exponentialRampToValueAtTime(Math.max(peak * 0.0008, 0.00001), t + dur);
  };

  // ================================================================ drums
  S.snare = function (E, t, vel = 1, p = {}) {
    const c = E.ctx;
    const dec = p.decay || 0.17;
    const dest0 = p.pan ? panNode(E, p.pan, E.drums) : E.drums;
    const dest = p.drive ? shaperTo(E, p.drive, dest0, 0.7) : dest0;
    const n = E.noiseSource(t, dec + 0.05);
    const bp = filter(E, 'bandpass', p.tone || 2100, 0.55);
    const hp = filter(E, 'highpass', 480);
    const g = c.createGain();
    expDecay(g.gain, t, vel * 0.75, dec);
    n.connect(bp); bp.connect(hp); hp.connect(g); g.connect(dest);
    const body = c.createOscillator();
    body.type = 'triangle';
    const bf = p.pitch || 188;
    body.frequency.setValueAtTime(bf * 1.4, t);
    body.frequency.exponentialRampToValueAtTime(bf, t + 0.03);
    const bg = c.createGain();
    expDecay(bg.gain, t, vel * 0.6, 0.1);
    body.connect(bg); bg.connect(dest);
    body.start(t);
    body.stop(t + 0.12);
  };

  S.hat = function (E, t, vel = 1, p = {}) {
    const c = E.ctx;
    const dec = p.open ? (p.decay || 0.28) : (p.decay || 0.035);
    const n = E.noiseSource(t, dec + 0.03);
    const hp = filter(E, 'highpass', p.cut || 7200, 0.9);
    const pk = filter(E, 'peaking', p.tone || 10500, 1.2);
    pk.gain.value = 6;
    const g = c.createGain();
    expDecay(g.gain, t, vel * (p.open ? 0.26 : 0.3), dec);
    n.connect(hp); hp.connect(pk); pk.connect(g);
    g.connect(panNode(E, p.pan || 0, E.drums));
  };

  S.clap = function (E, t, vel = 1, p = {}) {
    const c = E.ctx;
    const dec = p.decay || 0.14;
    const n = E.noiseSource(t, dec + 0.08);
    const bp = filter(E, 'bandpass', p.tone || 1250, 1.1);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    for (const k of [0, 0.011, 0.022]) {
      g.gain.setValueAtTime(vel * 0.7, t + k);
      g.gain.exponentialRampToValueAtTime(vel * 0.06, t + k + 0.0105);
    }
    g.gain.setValueAtTime(vel * 0.55, t + 0.033);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 0.033 + dec);
    n.connect(bp); bp.connect(g); g.connect(panNode(E, p.pan || 0, E.drums));
  };

  S.crash = function (E, t, vel = 1, p = {}) {
    const c = E.ctx;
    const dec = p.decay || 1.7;
    const n = E.noiseSource(t, dec + 0.1);
    const hp = filter(E, 'highpass', 4200, 0.7);
    const g = c.createGain();
    expDecay(g.gain, t, vel * 0.26, dec);
    n.connect(hp); hp.connect(g); g.connect(E.drums);
    g.connect(E.drumVerb);
  };

  // Inharmonic square cluster: metallic hits / industrial ride.
  S.metal = function (E, t, vel = 1, p = {}) {
    const c = E.ctx;
    const dec = p.decay || 0.2;
    const bp = filter(E, 'bandpass', p.tone || 3600, 2.4);
    const hp = filter(E, 'highpass', 1800);
    const g = c.createGain();
    expDecay(g.gain, t, vel * 0.22, dec);
    bp.connect(hp); hp.connect(g); g.connect(panNode(E, p.pan || 0, E.drums));
    const f = p.freq || 520;
    for (const r of [1, 1.4829, 1.9319, 2.5703, 3.1147]) {
      const o = c.createOscillator();
      o.type = 'square';
      o.frequency.value = f * r;
      o.connect(bp);
      o.start(t);
      o.stop(t + dec + 0.02);
    }
  };

  // =============================================================== fx
  S.impact = function (E, t, vel = 1, p = {}) {
    const c = E.ctx;
    const o = c.createOscillator();
    o.frequency.setValueAtTime(p.f0 || 120, t);
    o.frequency.exponentialRampToValueAtTime(p.f1 || 28, t + 1.2);
    const g = c.createGain();
    expDecay(g.gain, t, vel * 0.85, p.decay || 2.2);
    o.connect(g); g.connect(E.fx);
    o.start(t); o.stop(t + (p.decay || 2.2) + 0.05);
    const n = E.noiseSource(t, 1.3);
    const lp = filter(E, 'lowpass', 2200, 0.5);
    lp.frequency.setValueAtTime(5000, t);
    lp.frequency.exponentialRampToValueAtTime(200, t + 1.1);
    const ng = c.createGain();
    expDecay(ng.gain, t, vel * 0.5, 1.2);
    n.connect(lp); lp.connect(ng); ng.connect(E.fx);
  };

  S.riser = function (E, t, dur, vel = 1, p = {}) {
    const c = E.ctx;
    const n = E.noiseSource(t, dur + 0.05);
    const bp = filter(E, 'bandpass', 400, 2.5);
    bp.frequency.setValueAtTime(p.from || 320, t);
    bp.frequency.exponentialRampToValueAtTime(p.to || 9000, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vel * 0.32, t + dur);
    g.gain.setValueAtTime(0, t + dur + 0.005);
    n.connect(bp); bp.connect(g); g.connect(E.fx);
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(p.pitchFrom || 160, t);
    o.frequency.exponentialRampToValueAtTime(p.pitchTo || 1500, t + dur);
    const lp = filter(E, 'lowpass', 2600, 3);
    const og = c.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(vel * 0.05, t + dur);
    og.gain.setValueAtTime(0, t + dur + 0.005);
    o.connect(lp); lp.connect(og); og.connect(E.fx);
    o.start(t); o.stop(t + dur + 0.02);
  };

  // Reverse-swell noise that dives down (section changes).
  S.sweepDown = function (E, t, dur, vel = 1) {
    const c = E.ctx;
    const n = E.noiseSource(t, dur + 0.05);
    const bp = filter(E, 'bandpass', 6000, 3);
    bp.frequency.setValueAtTime(7000, t);
    bp.frequency.exponentialRampToValueAtTime(250, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vel * 0.25, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    n.connect(bp); bp.connect(g); g.connect(E.fx);
  };

  // ============================================================ tonal voices
  // Supersaw / hoover stab: detuned oscillators per note, spread L/C/R.
  // With `bend` it scoops into the note like a classic gabber hoover.
  S.stab = function (E, t, freqs, dur, vel = 0.8, p = {}) {
    const c = E.ctx;
    const amp = c.createGain();
    const peak = (vel * (p.gain || 0.2)) / Math.sqrt(freqs.length);
    const att = p.attack || 0.004, rel = p.release || 0.08;
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(peak, t + att);
    amp.gain.setTargetAtTime(peak * (p.sustain != null ? p.sustain : 0.55), t + att, p.decay || 0.12);
    amp.gain.setTargetAtTime(0, t + dur, rel);
    const f = filter(E, 'lowpass', p.cutHi || 5200, p.q || 1.4);
    f.frequency.setValueAtTime(p.cutHi || 5200, t);
    f.frequency.setTargetAtTime(p.cutLo || 900, t, p.fdecay || 0.09);
    f.connect(amp);
    amp.connect(p.dest || E.musicDuck);
    const panL = panNode(E, -0.6, f), panR = panNode(E, 0.6, f);
    const spread = p.spread != null ? p.spread : 14;
    const voices = E.lite ? Math.min(p.voices || 3, 3) : p.voices || 3;
    const end = t + dur + rel * 6;
    for (const hz of freqs) {
      for (let v = 0; v < voices; v++) {
        const k = voices > 1 ? (v / (voices - 1)) * 2 - 1 : 0; // -1..1
        const o = c.createOscillator();
        if (p.wave) o.setPeriodicWave(p.wave);
        else o.type = p.type || 'sawtooth';
        if (p.bend) {
          // hoover-style scoop into the note
          o.frequency.setValueAtTime(hz * Math.pow(2, p.bend / 1200), t);
          o.frequency.exponentialRampToValueAtTime(hz, t + (p.bendTime || 0.09));
        } else {
          o.frequency.value = hz;
        }
        o.detune.value = k * spread + (Math.random() - 0.5) * 4;
        o.connect(k < -0.2 ? panL : k > 0.2 ? panR : f);
        o.start(t);
        o.stop(end);
      }
    }
  };

  // Monophonic lead with delayed vibrato and optional glide (cents-linear).
  S.lead = function (E, t, freqs, dur, vel = 0.8, p = {}) {
    const c = E.ctx;
    const hz = freqs[0];
    const peak = vel * (p.gain || 0.16);
    const rel = p.release || 0.09;
    const end = t + dur + rel * 6;
    const f = filter(E, 'lowpass', p.cut || 2600, p.q || 2);
    const a = c.createGain();
    a.gain.setValueAtTime(0, t);
    a.gain.linearRampToValueAtTime(peak, t + (p.attack || 0.01));
    a.gain.setTargetAtTime(peak * 0.8, t + 0.02, 0.2);
    a.gain.setTargetAtTime(0, t + dur, rel);
    f.connect(a);
    a.connect(panNode(E, p.pan || 0, p.dest || E.lead));
    const lfo = c.createOscillator();
    lfo.frequency.value = p.vibRate || 5.6;
    const lg = c.createGain();
    lg.gain.setValueAtTime(0, t);
    lg.gain.linearRampToValueAtTime(hz * (p.vib != null ? p.vib : 0.007), t + Math.min(0.3, dur * 0.6));
    lfo.connect(lg);
    const types = p.wave ? ['custom'] : p.sub === false ? [p.type || 'sawtooth'] : [p.type || 'sawtooth', 'square'];
    types.forEach((ty, k) => {
      const o = c.createOscillator();
      if (ty === 'custom') o.setPeriodicWave(p.wave);
      else o.type = ty;
      if (p.from) {
        o.frequency.setValueAtTime(p.from, t);
        o.frequency.exponentialRampToValueAtTime(hz, t + (p.glide || 0.08));
      } else {
        o.frequency.setValueAtTime(hz, t);
      }
      o.detune.value = k ? -1200 : 0; // second osc an octave down for weight
      lg.connect(o.frequency);
      const og = c.createGain();
      og.gain.value = k ? 0.45 : 1;
      o.connect(og); og.connect(f);
      o.start(t); o.stop(end);
    });
    lfo.start(t); lfo.stop(end);
  };

  // Slow pad: two detuned saws + a sub triangle per note.
  S.pad = function (E, t, freqs, dur, vel = 0.6, p = {}) {
    const c = E.ctx;
    const peak = (vel * (p.gain || 0.12)) / Math.sqrt(freqs.length);
    const att = p.attack || 0.4, rel = p.release || 1.0;
    const end = t + dur + rel * 5;
    const f = filter(E, 'lowpass', p.cut || 1500, 0.8);
    f.frequency.setValueAtTime((p.cut || 1500) * 0.5, t);
    f.frequency.linearRampToValueAtTime(p.cut || 1500, t + att + 0.2);
    const a = c.createGain();
    a.gain.setValueAtTime(0, t);
    a.gain.linearRampToValueAtTime(peak, t + att);
    a.gain.setTargetAtTime(0, t + dur, rel);
    f.connect(a);
    a.connect(p.dest || E.musicDuck);
    const panL = panNode(E, -0.7, f), panR = panNode(E, 0.7, f);
    const layers = [[-9, panL, 'sawtooth'], [9, panR, 'sawtooth'], [0, f, 'triangle']];
    for (const hz of freqs) {
      (E.lite ? layers.slice(0, 2) : layers).forEach(([dt, dst, ty]) => {
        const o = c.createOscillator();
        if (p.wave && ty === 'sawtooth') o.setPeriodicWave(p.wave);
        else o.type = ty;
        o.frequency.value = hz;
        o.detune.value = dt;
        o.connect(dst);
        o.start(t);
        o.stop(end);
      });
    }
  };


  // Hoover: the gabber/rave "mentasm" sound. Pulse-width-ish detuned saws an
  // octave apart, a pitch scoop and a slow sag at the end of the note.
  S.hoover = function (E, t, freqs, dur, vel = 0.8, p = {}) {
    S.stab(E, t, freqs.concat(freqs.map((f) => f / 2)), dur, vel, Object.assign({
      voices: 4, spread: 26, bend: -700, bendTime: 0.12, cutHi: 3800, cutLo: 1500, q: 2.2,
      sustain: 0.8, decay: 0.3, release: 0.12, gain: 0.2,
    }, p));
  };

  // Screech: a driven band-passed saw with fast vibrato, for high leads.
  S.screech = function (E, t, freqs, dur, vel = 0.8, p = {}) {
    const c = E.ctx;
    const hz = freqs[0];
    const peak = vel * (p.gain || 0.1);
    const end = t + dur + 0.3;
    const bp = filter(E, 'bandpass', hz * 2.2, 3);
    bp.frequency.setValueAtTime(hz * 1.4, t);
    bp.frequency.exponentialRampToValueAtTime(hz * 3.4, t + Math.max(0.05, dur * 0.8));
    const a = c.createGain();
    a.gain.setValueAtTime(0, t);
    a.gain.linearRampToValueAtTime(peak, t + 0.008);
    a.gain.setTargetAtTime(0, t + dur, 0.05);
    const sh = shaperTo(E, 0.6, panNode(E, p.pan || 0, p.dest || E.lead), 0.7);
    bp.connect(a); a.connect(sh);
    const lfo = c.createOscillator();
    lfo.frequency.value = p.vibRate || 7.5;
    const lg = c.createGain();
    lg.gain.value = hz * 0.012;
    lfo.connect(lg);
    const oscs = E.lite ? [0] : [-9, 9];
    for (const dt of oscs) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      if (p.from) {
        o.frequency.setValueAtTime(p.from, t);
        o.frequency.exponentialRampToValueAtTime(hz, t + (p.glide || 0.05));
      } else o.frequency.value = hz;
      o.detune.value = dt;
      lg.connect(o.frequency);
      o.connect(bp);
      o.start(t); o.stop(end);
    }
    lfo.start(t); lfo.stop(end);
  };

  X.S = S;
})(window.FP);
