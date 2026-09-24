/* FUSION POINT — the conductor.
 * A look-ahead scheduler on a 16th-note grid of the section's meta tempo.
 * Sections talk to the world only through `api`; every call takes an
 * absolute audio time and also emits a timestamped event for the visuals.
 * Kick-train lanes are rendered up to the same horizon after each tick. */
'use strict';
(function (X) {
  const U = X.U, S = X.S, K = X.K;

  const LANE_DEFAULTS = { cut: 11000, q: 0.7, pan: 0, level: 1 };

  class Conductor {
    constructor(engine, sections, opts = {}) {
      this.E = engine;
      this.sections = sections;
      this.emit = opts.onEvent || (() => {});
      this.seed = (opts.seed != null ? opts.seed : Math.floor(Math.random() * 4294967296)) >>> 0;
      this.cycle = 0;
      this.lookahead = opts.lookahead || 0.2;
      this.running = false;
      this.lanes = new Map();
      if (!engine.kickTables) engine.kickTables = K.makeTables(engine.ctx.sampleRate);
      this._timer = null;
      this.horizon = 0;
    }

    start(idx = 0, t0) {
      const t = t0 != null ? t0 : this.E.now + 0.08;
      this.nextTime = t;
      this.running = true;
      this._enter(idx, t, true);
    }

    run() {
      if (this._timer) return;
      const tick = () => {
        if (!this.running) return;
        const hidden = typeof document !== 'undefined' && document.hidden;
        this.scheduleUntil(this.E.now + (hidden ? 1.5 : this.lookahead));
      };
      tick();
      this._timer = setInterval(tick, 25);
    }
    halt() {
      if (this._timer) clearInterval(this._timer);
      this._timer = null;
    }

    lane(id) {
      let l = this.lanes.get(id);
      if (!l) {
        l = new K.Lane(this.E, id, {
          onChunk: (c) => this.emit(Object.assign({ type: 'train', t: c.t0 }, c)),
        });
        this.lanes.set(id, l);
      }
      return l;
    }

    _meta(sec) {
      return { id: sec.id, num: sec.num, title: sec.title, subtitle: sec.subtitle || '', hue: sec.hue || 80, bars: sec.bars, dur: Conductor.duration(sec) };
    }

    _enter(idx, t, first) {
      if (this.sec && this.sec.onExit) this.sec.onExit(this.state, t, this.api);
      this.secIdx = U.mod(idx, this.sections.length);
      this.sec = this.sections[this.secIdx];
      this.secStart = t;
      this.bar = 0;
      this.step = 0;
      this.rng = new U.Rng(U.hashSeed(this.seed, this.cycle, this.secIdx));
      this.api = this._makeApi();
      for (const l of this.lanes.values()) l.set(t, Object.assign({ tc: 0.01 }, LANE_DEFAULTS));
      this.emit({
        type: 'section', t, index: this.secIdx, count: this.sections.length,
        meta: this._meta(this.sec), all: this.sections.map((s) => this._meta(s)),
        cycle: this.cycle, seed: this.seed,
      });
      if (!first && this.sec.impact !== false) {
        this.api.fx(t, 'impact', 0.8);
        this.api.drum(t, 'crash', 0.8);
      }
      this._tempo(t);
      this.state = this.sec.init ? this.sec.init(this.api, t) || {} : {};
    }

    _tempo() {
      const sec = this.sec;
      this.bpm = sec.bpmAt ? sec.bpmAt(this.bar, this.state || {}) : sec.bpm;
      this.steps = sec.steps || 16;
      this.stepDur = 60 / this.bpm / 4;
    }

    _beginBar(t) {
      this._tempo(t);
      this.E.setTempo(this.bpm, t);
      this.emit({ type: 'bar', t, bar: this.bar, bars: this.sec.bars, bpm: this.bpm, barDur: this.stepDur * this.steps, steps: this.steps });
      if (this.sec.onBar) this.sec.onBar(this.state, this.bar, t, this.api);
    }

    scheduleUntil(horizon) {
      let guard = 0;
      while (this.running && this.nextTime < horizon && guard++ < 4096) {
        const t = this.nextTime;
        if (this.step === 0) this._beginBar(t);
        if (this.step % 4 === 0) this.emit({ type: 'beat', t, beat: this.step / 4, bar: this.bar });
        if (this.sec.onStep) this.sec.onStep(this.state, this.bar, this.step, t, this.api);
        this.nextTime += this.stepDur;
        this.step++;
        if (this.step >= this.steps) {
          this.step = 0;
          this.bar++;
          if (this.bar >= this.sec.bars) {
            let next = this.secIdx + 1;
            if (next >= this.sections.length) { next = 0; this.cycle++; }
            this._enter(next, this.nextTime, false);
          }
        }
      }
      if (this.running) {
        this.horizon = horizon;
        for (const l of this.lanes.values()) l.renderUntil(horizon);
      }
    }

    jump(idx) {
      const t = this.E.now + 0.05;
      for (const l of this.lanes.values()) l.cancelFrom(t);
      this.nextTime = t;
      this.step = 0;
      this._enter(idx, t, false);
    }

    // Total length of one section in seconds (for tools and the timeline).
    static duration(sec) {
      let d = 0;
      for (let b = 0; b < sec.bars; b++) {
        const bpm = sec.bpmAt ? sec.bpmAt(b, {}) : sec.bpm;
        d += ((sec.steps || 16) * 60) / bpm / 4;
      }
      return d;
    }

    _makeApi() {
      const self = this, E = this.E;
      return {
        E,
        get rng() { return self.rng; },
        get stepDur() { return self.stepDur; },
        get beatDur() { return self.stepDur * 4; },
        get barDur() { return self.stepDur * self.steps; },
        get bpm() { return self.bpm; },
        get cycle() { return self.cycle; },
        get secStart() { return self.secStart; },
        get secDur() { return Conductor.duration(self.sec); },
        lite: E.lite,
        // Kick trains: one segment of a lane (see K.Lane.add).
        train(lane, t0, t1, spec) {
          self.lane(lane).add(Object.assign({ t0, t1 }, spec));
        },
        lane(lane, t, params) { self.lane(lane).set(t, params); },
        focus(t, lane, extra) { self.emit(Object.assign({ type: 'focus', t, lane }, extra || {})); },
        play(t, inst, hz, dur, vel = 0.8, p = {}) {
          const arr = Array.isArray(hz) ? hz : [hz];
          S[inst](E, t, arr, dur, vel, p);
          self.emit({ type: 'note', t, hz: arr, inst, dur, vel });
        },
        drum(t, kind, vel = 1, p = {}) {
          S[kind](E, t, vel, p);
          self.emit({ type: 'drum', t, kind, vel });
        },
        fx(t, kind, a, b, c) {
          S[kind](E, t, a, b, c);
          self.emit({ type: 'fx', t, kind, dur: kind === 'riser' || kind === 'sweepDown' ? a : 0 });
        },
        duck(t, depth, release) { E.duck(t, depth, release); },
        // A line in the lab log (bottom left).
        text(t, text, style) { self.emit({ type: 'text', t, text, style: style || {} }); },
        // A big stamped word across the coil (genre thresholds, drops).
        stamp(t, text, hue) { self.emit({ type: 'stamp', t, text, hue }); },
        // Theory lines under the section title.
        stat(t, lines) { self.emit({ type: 'stat', t, lines: Array.isArray(lines) ? lines : [lines] }); },
        chord(t, info) { self.emit(Object.assign({ type: 'chord', t }, info)); },
        flash(t, amount = 1) { self.emit({ type: 'flash', t, amount }); },
        event(t, kind, data) { self.emit(Object.assign({ type: kind, t }, data || {})); },
      };
    }
  }

  X.Conductor = Conductor;
})(window.FP);
