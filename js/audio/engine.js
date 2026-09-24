/* FUSION POINT — audio engine.
 * Works with a live AudioContext or an OfflineAudioContext (for tests).
 *
 *   kick-train lanes → kick bus (own compressor)
 *   voices → buses (drums / music / lead / fx)
 *          → sends (generated-IR reverb, ping-pong delay)
 *          → pre → high-pass → glue compressor → make-up
 *          → limiter → soft clipper → [analyser tap] → out (volume/mute) */
'use strict';
(function (X) {
  class Engine {
    constructor(ctx, opts = {}) {
      this.ctx = ctx;
      this.volume = opts.volume != null ? opts.volume : 0.8;
      this.muted = false;
      this.lite = !!opts.lite; // fewer oscillators per voice, for phones
      this.bpm = 120;
      this._curves = new Map();
      this._build();
    }

    get now() { return this.ctx.currentTime; }

    _gain(v, dest) {
      const g = this.ctx.createGain();
      g.gain.value = v;
      if (dest) g.connect(dest);
      return g;
    }

    _build() {
      const c = this.ctx;

      // ---------------------------------------------------------- master
      this.out = this._gain(this.volume, c.destination);
      this.clipper = c.createWaveShaper();
      this.clipper.curve = this.softClipCurve();
      this.clipper.oversample = '2x';
      this.clipper.connect(this.out);

      this.limiter = c.createDynamicsCompressor();
      this._setComp(this.limiter, -3, 0, 20, 0.001, 0.09);
      this.limiter.connect(this.clipper);

      this.makeup = this._gain(1.0, this.limiter);
      this.glue = c.createDynamicsCompressor();
      this._setComp(this.glue, -18, 8, 3, 0.01, 0.2);
      this.glue.connect(this.makeup);

      this.hp = c.createBiquadFilter();
      this.hp.type = 'highpass';
      this.hp.frequency.value = 30;
      this.hp.Q.value = 0.7;
      this.hp.connect(this.glue);
      this.pre = this._gain(1, this.hp);

      this.analyser = c.createAnalyser();
      this.analyser.fftSize = 8192;
      this.analyser.smoothingTimeConstant = 0.6;
      this.clipper.connect(this.analyser);

      // ------------------------------------------------------------ sends
      this.verbIn = this._gain(1);
      this.convolver = c.createConvolver();
      this.convolver.buffer = this.lite ? this._makeIR(1.8, 2.4) : this._makeIR(2.8, 2.4);
      this.verbIn.connect(this.convolver);
      this.verbOut = this._gain(0.32, this.pre);
      this.convolver.connect(this.verbOut);

      this.delayIn = this._gain(1);
      const dhp = c.createBiquadFilter();
      dhp.type = 'highpass'; dhp.frequency.value = 260;
      this.delayIn.connect(dhp);
      this.dL = c.createDelay(2.5);
      this.dR = c.createDelay(2.5);
      const tone = c.createBiquadFilter();
      tone.type = 'lowpass'; tone.frequency.value = 3400;
      const fbA = this._gain(0.42), fbB = this._gain(0.42);
      dhp.connect(this.dL);
      this.dL.connect(fbA); fbA.connect(this.dR);
      this.dR.connect(tone); tone.connect(fbB); fbB.connect(this.dL);
      const merger = c.createChannelMerger(2);
      this.dL.connect(merger, 0, 0);
      this.dR.connect(merger, 0, 1);
      this.delayOut = this._gain(0.34, this.pre);
      merger.connect(this.delayOut);
      this.setTempo(this.bpm, 0);

      // ------------------------------------------------------------ buses
      this.drumComp = c.createDynamicsCompressor();
      this._setComp(this.drumComp, -12, 4, 4, 0.002, 0.1);
      this.drumComp.connect(this.pre);
      this.drums = this._gain(0.9, this.drumComp);
      this.drumVerb = this._gain(0.06, this.verbIn);
      this.drums.connect(this.drumVerb);

      // Kick-train lanes: their own glue so a 26 400 BPM tone and a 180 BPM
      // gabber kick sit at similar loudness.
      this.kickComp = c.createDynamicsCompressor();
      this._setComp(this.kickComp, -14, 6, 3, 0.003, 0.12);
      this.kickComp.connect(this.pre);
      this.kicks = this._gain(0.5, this.kickComp);
      this.kicks.connect(this._gain(0.05, this.verbIn));

      this.musicDuck = this._gain(1);
      this.music = this._gain(0.62, this.pre);
      this.musicDuck.connect(this.music);
      this.music.connect(this._gain(0.34, this.verbIn));
      this.music.connect(this._gain(0.2, this.delayIn));

      this.lead = this._gain(0.5, this.pre);
      this.lead.connect(this._gain(0.3, this.verbIn));
      this.lead.connect(this._gain(0.3, this.delayIn));

      this.fx = this._gain(0.55, this.pre);
      this.fx.connect(this._gain(0.45, this.verbIn));

      // --------------------------------------------------- shared sources
      this.noise = this._makeNoise(2.5);
      this.waves = this._makeWaves();
    }

    _setComp(comp, threshold, knee, ratio, attack, release) {
      comp.threshold.value = threshold;
      comp.knee.value = knee;
      comp.ratio.value = ratio;
      comp.attack.value = attack;
      comp.release.value = release;
    }

    // Linear up to ±0.6, then a tanh knee that never exceeds ±0.99.
    softClipCurve() {
      const n = 4096, curve = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * 2 - 1;
        const ax = Math.abs(x);
        const y = ax < 0.6 ? ax : 0.6 + 0.39 * Math.tanh((ax - 0.6) / 0.39);
        curve[i] = Math.sign(x) * y;
      }
      return curve;
    }

    // tanh drive curves, cached by amount.
    driveCurve(amount) {
      const key = Math.round(amount * 100);
      if (this._curves.has(key)) return this._curves.get(key);
      const n = 2048, curve = new Float32Array(n), k = 1 + amount * 12;
      const norm = Math.tanh(k);
      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * 2 - 1;
        curve[i] = Math.tanh(k * x) / norm;
      }
      this._curves.set(key, curve);
      return curve;
    }

    _makeNoise(seconds) {
      const c = this.ctx, len = Math.floor(c.sampleRate * seconds);
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      return buf;
    }

    // Stereo reverb impulse: early reflections + exponentially decaying
    // noise that gets darker as it decays. Generated, not sampled.
    _makeIR(seconds, decay) {
      const c = this.ctx, sr = c.sampleRate, len = Math.floor(sr * seconds);
      const buf = c.createBuffer(2, len, sr);
      const early = [0.011, 0.017, 0.023, 0.031, 0.041, 0.053];
      for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        let lp = 0;
        for (let i = 0; i < len; i++) {
          const t = i / sr;
          const env = Math.pow(1 - i / len, decay) * Math.min(1, t / 0.02);
          const a = 0.15 + 0.8 * (i / len); // one-pole low-pass coefficient grows → darker tail
          lp += ((Math.random() * 2 - 1) - lp) * (1 - a);
          d[i] = lp * env * 0.9;
        }
        early.forEach((et, k) => {
          const idx = Math.floor((et + ch * 0.0037) * sr);
          if (idx < len) d[idx] += (k % 2 ? -1 : 1) * 0.5 * Math.pow(0.8, k);
        });
      }
      return buf;
    }

    // Custom periodic waves: odd harmonics, a hollow organ and a buzzy brass.
    _makeWaves() {
      const c = this.ctx;
      const make = (fn, n = 32) => {
        const re = new Float32Array(n), im = new Float32Array(n);
        for (let k = 1; k < n; k++) im[k] = fn(k);
        return c.createPeriodicWave(re, im);
      };
      return {
        odd: make((k) => (k % 2 ? 1 / k : 0)),
        oddBright: make((k) => (k % 2 ? 1 / Math.sqrt(k) : 0) * (k < 24 ? 1 : 0)),
        organ: make((k) => ({ 1: 1, 2: 0.6, 3: 0.4, 4: 0.25, 6: 0.18, 8: 0.12 }[k] || 0)),
        brass: make((k) => Math.pow(0.82, k) * (1 + (k === 2 ? 0.4 : 0))),
      };
    }

    noiseSource(t, dur) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const off = Math.random() * (this.noise.duration - 0.1);
      src.start(t, off);
      src.stop(t + dur);
      return src;
    }

    setTempo(bpm, t) {
      this.bpm = bpm;
      const dotted8 = (60 / bpm) * 0.75;
      const when = Math.max(t || 0, this.ctx.currentTime);
      this.dL.delayTime.setValueAtTime(dotted8, when);
      this.dR.delayTime.setValueAtTime(dotted8, when);
    }

    // Side-chain style pump on everything that isn't drums.
    duck(t, depth = 0.55, release = 0.13) {
      const targets = [[this.musicDuck.gain, depth]];
      for (const [p, d] of targets) {
        p.cancelScheduledValues(t);
        p.setTargetAtTime(1 - d, t, 0.004);
        p.setTargetAtTime(1, t + 0.03, release);
      }
    }

    setVolume(v) {
      this.volume = v;
      if (!this.muted) this._rampOut(v);
    }
    setMuted(m) {
      this.muted = m;
      this._rampOut(m ? 0 : this.volume);
    }
    _rampOut(v) {
      const g = this.out.gain, now = this.ctx.currentTime;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.setTargetAtTime(v, now, 0.006);
    }
    // Instant silence, then freeze the clock.
    hardStop() {
      const g = this.out.gain, now = this.ctx.currentTime;
      g.cancelScheduledValues(now);
      g.setValueAtTime(0, now);
      if (this.ctx.state === 'running' && this.ctx.suspend) return this.ctx.suspend();
      return Promise.resolve();
    }
    resume() {
      const p = this.ctx.resume ? this.ctx.resume() : Promise.resolve();
      return p.then(() => this._rampOut(this.muted ? 0 : this.volume));
    }
  }

  X.Engine = Engine;
})(window.FP);
