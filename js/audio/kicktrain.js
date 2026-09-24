/* FUSION POINT — the kick-train synthesizer.
 *
 * Extratone is made by retriggering a kick drum so fast that the hits fuse
 * into a tone. We do exactly that, sample by sample: a lane owns one kick
 * waveform (a "table", synthesized once at start-up) and a play head. Every
 * time the lane's phase wraps, the head jumps back to the start of the kick.
 * At 3 Hz you hear whole kicks; at 440 Hz you hear only the first 2.3 ms of
 * each one, repeated: a pitched, buzzy wave whose timbre is the kick's attack.
 *
 * Lanes render ahead of the audio clock in small chunks (AudioBufferSource
 * per chunk, sample-contiguous), so tempo can be any function of time,
 * including continuous accelerandos and phase-locked Risset layers. */
'use strict';
(function (X) {
  const U = X.U;
  const K = {};

  // ------------------------------------------------------------ kick tables
  // f(t) = f1 + (f0 − f1)·e^(−t/tau), plus a very fast click from `click` Hz.
  K.SPECS = {
    gabber: { f0: 330, f1: 47, tau: 0.032, click: 2600, clickTau: 0.0016, hold: 0.15, decay: 0.26, drive: 6, lp: 7000, len: 0.55 },
    punch: { f0: 950, f1: 52, tau: 0.017, click: 3200, clickTau: 0.0012, hold: 0.05, decay: 0.2, drive: 2.4, lp: 9000, len: 0.4 },
    zap: { f0: 3600, f1: 95, tau: 0.007, click: 0, clickTau: 0.001, hold: 0.02, decay: 0.14, drive: 1.7, lp: 12000, len: 0.3 },
    thud: { f0: 190, f1: 50, tau: 0.045, click: 900, clickTau: 0.002, hold: 0.07, decay: 0.32, drive: 1.2, lp: 5000, len: 0.5 },
    snare: { noise: true, tone: 196, decay: 0.13, drive: 1.8, lp: 9000, len: 0.3 },
  };

  function makeTable(sr, spec, seed) {
    const n = Math.floor(sr * spec.len);
    const d = new Float32Array(n);
    const rnd = new U.Rng(seed);
    if (spec.noise) {
      // Snare: band-limited noise burst plus a short pitched body.
      let lp = 0, prev = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const w = rnd.next() * 2 - 1;
        lp += (w - lp) * 0.55;
        const hp = lp - prev; prev = lp;
        const env = Math.exp(-t / (spec.decay / 3.2)) * Math.min(1, t / 0.0006);
        const body = Math.sin(2 * Math.PI * spec.tone * t) * Math.exp(-t / 0.035);
        d[i] = hp * 1.6 * env + body * 0.7 * Math.min(1, t / 0.0006);
      }
    } else {
      let ph = 0;
      const dtau = spec.decay / 4;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        let f = spec.f1 + (spec.f0 - spec.f1) * Math.exp(-t / spec.tau);
        if (spec.click) f += (spec.click - spec.f0) * Math.exp(-t / spec.clickTau);
        ph += (2 * Math.PI * f) / sr;
        const env = t < spec.hold ? 1 : Math.exp(-(t - spec.hold) / dtau);
        d[i] = Math.sin(ph) * env;
      }
    }
    // drive → one-pole low-pass → post-drive decay → normalise → end fade.
    // (Without the post-drive envelope the clipper would hold the tail at
    // full scale and every kick would be a 300 ms square wave.)
    const k = spec.drive, norm = Math.tanh(k);
    const a = Math.exp((-2 * Math.PI * spec.lp) / sr);
    const postHold = spec.noise ? 0 : spec.hold * 0.8, postTau = spec.decay / 3.5;
    let y = 0, peak = 1e-9;
    for (let i = 0; i < n; i++) {
      y = (1 - a) * (Math.tanh(k * d[i]) / norm) + a * y;
      const t = i / sr;
      d[i] = y * (t < postHold ? 1 : Math.exp(-(t - postHold) / postTau));
      peak = Math.max(peak, Math.abs(y));
    }
    const tail = Math.floor(sr * 0.002);
    for (let i = 0; i < n; i++) {
      d[i] /= peak;
      if (i > n - tail) d[i] *= (n - i) / tail;
    }
    // Cumulative energy, for loudness matching across rates.
    const cum = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) cum[i + 1] = cum[i] + d[i] * d[i];
    return { data: d, cum, n };
  }

  // RMS of an ideal retriggered train at `rate` Hz: only the first 1/rate
  // seconds of the table ever play.
  function trainRms(tab, sr, rate) {
    const m = Math.min(tab.n, Math.max(1, Math.floor(sr / rate)));
    return Math.sqrt((tab.cum[m] / sr) * rate);
  }

  K.makeTables = function (sr) {
    const out = {};
    let s = 1;
    for (const [name, spec] of Object.entries(K.SPECS)) {
      const tab = makeTable(sr, spec, 0x5eed + s++);
      // Loudness matching: faster trains get quieter so that a 440 Hz
      // extratone does not come out 10 dB louder than a 4 Hz kick.
      tab.ref = trainRms(tab, sr, 4) * 0.9;
      tab.comp = (rate) => Math.min(1, tab.ref / trainRms(tab, sr, rate));
      out[name] = tab;
    }
    return out;
  };
  K.trainRms = trainRms;

  // ------------------------------------------------------------------ lane
  const CHUNK = 2048;

  class Lane {
    constructor(E, id, opts = {}) {
      const c = E.ctx;
      this.E = E;
      this.id = id;
      this.sr = c.sampleRate;
      this.tables = E.kickTables;
      this.onChunk = opts.onChunk || null;
      this.input = c.createGain();
      this.filter = c.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.filter.frequency.value = opts.cut || 11000;
      this.filter.Q.value = 0.7;
      this.panner = c.createStereoPanner();
      this.panner.pan.value = opts.pan || 0;
      this.level = c.createGain();
      this.level.gain.value = opts.level != null ? opts.level : 1;
      this.input.connect(this.filter);
      this.filter.connect(this.panner);
      this.panner.connect(this.level);
      this.level.connect(opts.dest || E.kicks);
      this.segs = [];
      this.sources = [];
      this.reset();
    }

    reset() {
      this.cursor = -1;      // absolute sample index rendered up to
      this.phase = 0;
      this.pos = 1e9;        // play head in the table (samples); 1e9 = silent
      this.xpos = 0; this.xn = 0; this.xlen = 1;  // retrigger crossfade
      this.lastSeg = null;
      this.lastFloor = 0;
    }

    /* seg: { t0, t1, rate: Hz | fn(t), phase?: fn(t) (cycles), gain: number | fn(t),
     *        kick: table name, speed: table playback speed, tie: continue phase,
     *        fadeIn, fadeOut (s) } */
    add(seg) {
      const s = Object.assign({ gain: 1, kick: 'gabber', speed: 1, fadeIn: 0.002, fadeOut: 0.004 }, seg);
      s.s0 = Math.round(s.t0 * this.sr);
      s.s1 = Math.round(s.t1 * this.sr);
      if (s.s1 <= s.s0) return;
      s.tab = this.tables[s.kick] || this.tables.gabber;
      if (s.tie) {
        const prev = this.segs.find((o) => o.s1 === s.s0);
        if (prev) { prev.fadeOut = 0; prev.nextTied = true; s.fadeIn = 0; }
      }
      // keep segments sorted and non-overlapping (a new one truncates older ones)
      const segs = this.segs;
      for (const o of segs) if (o.s1 > s.s0 && o.s0 < s.s0) o.s1 = s.s0;
      for (let i = segs.length - 1; i >= 0; i--) if (segs[i].s0 >= s.s0) segs.splice(i, 1);
      segs.push(s);
    }

    set(t, p) {
      const at = (param, v, tc = 0.03) => { if (v != null) param.setTargetAtTime(v, t, tc); };
      at(this.filter.frequency, p.cut, p.tc);
      at(this.filter.Q, p.q, p.tc);
      at(this.panner.pan, p.pan, p.tc);
      at(this.level.gain, p.level, p.tc);
    }

    // Drop everything from t on (section jumps).
    cancelFrom(t) {
      const st = Math.round(t * this.sr);
      this.segs = this.segs.filter((s) => s.s0 < st);
      for (const s of this.segs) if (s.s1 > st) s.s1 = st;
      for (const src of this.sources) {
        if (src.endAt > t) { try { src.node.stop(Math.max(t, src.startAt)); } catch { /* already stopped */ } }
      }
      this.sources = this.sources.filter((s) => s.endAt <= t);
      if (this.cursor > st) this.cursor = st;
      this.pos = 1e9; this.xn = 0; this.lastSeg = null;
    }

    renderUntil(t) {
      const end = Math.round(t * this.sr);
      const segs = this.segs;
      if (this.cursor < 0) this.cursor = segs.length ? Math.min(segs[0].s0, end) : end;
      const now = this.E.ctx.currentTime;
      if (this.sources.length > 64) this.sources = this.sources.filter((s) => s.endAt > now);
      // If the main thread stalled past our render head, skip the lost time
      // rather than queueing audio in the past (which would play late, piled up).
      const nowS = Math.ceil(now * this.sr);
      if (this.cursor >= 0 && this.cursor < nowS) this.cursor = nowS;
      while (this.cursor < end) {
        while (segs.length && segs[0].s1 <= this.cursor) segs.shift();
        const first = segs[0];
        if (!first && this.xn === 0) { this.cursor = end; break; }
        if (first && first.s0 > this.cursor && this.xn === 0) {
          // silent gap: skip ahead without making a buffer
          this.cursor = Math.min(first.s0, end);
          this.pos = 1e9;
          continue;
        }
        if (end - this.cursor < 256) break; // wait for a bigger chunk
        const to = Math.min(end, this.cursor + CHUNK);
        this._chunk(this.cursor, to);
        this.cursor = to;
      }
    }

    _chunk(from, to) {
      const sr = this.sr, len = to - from;
      const ctx = this.E.ctx;
      const buf = ctx.createBuffer(1, len, sr);
      const out = buf.getChannelData(0);
      const onsets = [];
      const rates = [];
      let si = 0;
      const segs = this.segs;
      let seg = null;
      let rateNow = 0;
      for (let i = 0; i < len; i++) {
        const s = from + i;
        while (si < segs.length && segs[si].s1 <= s) si++;
        const cand = si < segs.length && segs[si].s0 <= s ? segs[si] : null;
        if (cand !== seg) {
          seg = cand;
          if (seg && seg !== this.lastSeg) {
            const tie = seg.tie && this.lastSeg && this.lastSeg.s1 === seg.s0;
            if (!tie) {
              if (seg.phase) this.lastFloor = Math.floor(seg.phase(s / sr));
              else this.phase = 1; // trigger on the first sample
            }
            this.lastSeg = seg;
          }
        }
        if (!seg) {
          // between segments: let a crossfade finish, otherwise silence
          let v = 0;
          if (this.xn > 0) { v = this._read(this.lastTab, this.xpos) * (this.xn / this.xlen); this.xpos += 1; this.xn--; }
          out[i] = v;
          this.pos = 1e9;
          continue;
        }
        const t = s / sr;
        const tab = seg.tab;
        let rate, fire = false, frac = 0;
        if (seg.phase) {
          const ph = seg.phase(t);
          const fl = Math.floor(ph);
          rate = Math.max(1e-6, (ph - seg.phase(t - 1 / sr)) * sr);
          if (fl !== this.lastFloor) { fire = true; frac = (ph - fl) / (rate / sr); this.lastFloor = fl; }
        } else {
          rate = typeof seg.rate === 'function' ? seg.rate(t) : seg.rate;
          this.phase += rate / sr;
          // (a wrap in the last ~quarter period of an untied segment would be
          // the next segment's first kick, which fires on its own)
          if (this.phase >= 1 && (seg.nextTied || seg.s1 - s > (0.25 * sr) / rate)) {
            fire = true;
            this.phase -= Math.floor(this.phase);
            frac = this.phase / (rate / sr);
          } else if (this.phase >= 1) this.phase = 0.999999;
        }
        rateNow = rate;
        if (fire) {
          if (this.pos < tab.n) {
            this.xpos = this.pos; this.lastTab = this.curTab || tab;
            this.xlen = this.xn = Math.max(4, Math.min(48, Math.floor((sr / rate) * 0.3)));
          }
          this.pos = Math.min(frac, 4) * seg.speed;
          this.curTab = tab;
          onsets.push(t - frac / sr);
        }
        let v = this.pos < tab.n ? this._read(tab, this.pos) : 0;
        this.pos += seg.speed;
        if (this.xn > 0) { v += this._read(this.lastTab, this.xpos) * (this.xn / this.xlen); this.xpos += seg.speed; this.xn--; }
        let g = typeof seg.gain === 'function' ? seg.gain(t) : seg.gain;
        if (seg.fadeIn > 0) g *= Math.min(1, (s - seg.s0) / (seg.fadeIn * sr));
        if (seg.fadeOut > 0) g *= Math.min(1, (seg.s1 - s) / (seg.fadeOut * sr));
        out[i] = v * g * tab.comp(rate);
        if ((i & 255) === 0) rates.push(t, rate);
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.input);
      const t0 = from / sr;
      src.start(t0);
      this.sources.push({ node: src, startAt: t0, endAt: to / sr });
      if (this.onChunk) this.onChunk({ lane: this.id, t0, t1: to / sr, onsets, rates, samples: out, sr, rate: rateNow });
    }

    _read(tab, p) {
      const i = p | 0;
      if (i >= tab.n - 1 || i < 0) return 0;
      const f = p - i;
      return tab.data[i] + (tab.data[i + 1] - tab.data[i]) * f;
    }

    dispose() {
      this.cancelFrom(0);
      this.level.disconnect();
    }
  }
  K.Lane = Lane;

  X.K = K;
})(window.FP);
