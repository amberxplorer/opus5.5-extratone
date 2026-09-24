/* FUSION POINT — the renderer.
 * Conductor events arrive ahead of the audio (they are scheduled in
 * advance). They wait in a time-sorted queue and are applied when the audio
 * clock reaches them, so every dot on the coil lands on the kick it stands
 * for.
 *
 * Photosensitivity rules, enforced here rather than trusted to sections:
 *   · nothing changes brightness at the kick rate (kicks are persistent
 *     marks that move smoothly, never blinks);
 *   · full-screen flashes are rate-limited to one per 0.6 s (well under
 *     three per second), capped at low opacity, and never red;
 *   · reduced mode has no flashes, no shake, no pops, gentler stamps. */
'use strict';
(function (X) {
  const U = X.U, T = X.T, C = X.Coil, L = X.Ladder, SC = X.Scope, SPR = X.Sprites, TAU = U.TAU;

  const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';
  const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

  const LANES = {
    kick: [78, 'kick'], bass: [330, 'bass'], buzz: [190, 'buzz'], lead: [40, 'lead'],
    a: [280, 'voice 1'], b: [200, 'voice 2'], c: [150, 'voice 3'], d: [30, 'voice 4'],
    r0: [150, 'layer 1'], r1: [180, 'layer 2'], r2: [210, 'layer 3'], r3: [250, 'layer 4'], r4: [290, 'layer 5'],
    snr: [55, 'snare train'], tone: [18, 'tone'],
  };
  const safeHue = (h) => (h < 25 || h > 335 ? 300 : h);

  class Ring {
    constructor(cap) { this.a = new Float64Array(cap); this.cap = cap; this.size = 0; this.head = 0; }
    push(v) { this.a[this.head] = v; this.head = (this.head + 1) % this.cap; if (this.size < this.cap) this.size++; }
    get(i) { return this.a[(this.head - this.size + i + this.cap) % this.cap]; } // 0 = oldest
    clear() { this.size = 0; this.head = 0; }
  }

  class LaneView {
    constructor(id) {
      const [hue, name] = LANES[id] || [60, id];
      this.id = id; this.hue = hue; this.name = name;
      this.hist = new Ring(16384);
      this.pending = []; this.pi = 0;
      this.chunks = [];
      this.keys = []; // [t, rate, t, rate, ...]
      this.rate = 0; this.active = false; this.lastOnset = -1e9; this.seen = false;
    }
    clear() { this.hist.clear(); this.pending = []; this.pi = 0; this.chunks = []; this.keys = []; this.active = false; this.lastOnset = -1e9; }
  }

  class Visuals {
    constructor(canvas, hud, opts = {}) {
      this.canvas = canvas;
      this.g = canvas.getContext('2d', { alpha: false });
      this.hud = hud;
      this.reduced = !!opts.reduced;
      this.motion = opts.motion != null ? opts.motion : 1;
      this.sampleRate = opts.sampleRate || 48000;
      this.quality = 1;
      this.hudVisible = true;
      this.MONO = MONO; this.SANS = SANS;
      this.queue = [];
      this.lanes = new Map();
      this.bars = [];
      this.barCount = 0;
      this.rings = [];
      this.stamps = [];
      this.parts = [];
      this.kicks = 0;
      this.focus = 'kick';
      this.label = null;
      this.hue = 78; this.hueTarget = 78;
      this.flashAmt = 0; this.flashHue = 78; this.lastFlash = -1e9;
      this.shake = 0;
      this.section = null; this.secStart = 0; this.secDur = 1;
      this.startClock = null;
      this.beatsPerBar = 4;
      this.barPulse = 0;
      this.dt = 1 / 60;
      this._frameTimes = [];
      this.resize();
    }

    // --------------------------------------------------------------- setup
    setReduced(r) { this.reduced = r; if (this.hud) this.hud.reduced = r; }
    setHudVisible(v) { this.hudVisible = v; if (this.hud) this.hud.setVisible(v); this.layout(); }

    resize() {
      const cw = this.canvas.clientWidth || window.innerWidth;
      const ch = this.canvas.clientHeight || window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2) * this.quality;
      this.u = dpr;
      this.cssW = cw; this.cssH = ch;
      this.w = Math.max(1, Math.round(cw * dpr));
      this.h = Math.max(1, Math.round(ch * dpr));
      if (this.canvas.width !== this.w) this.canvas.width = this.w;
      if (this.canvas.height !== this.h) this.canvas.height = this.h;
      this._bg = null;
      this.layout();
    }

    // Canvas geometry, fitted around the DOM panels.
    layout() {
      const W = this.cssW, H = this.cssH, u = this.u;
      const doc = document;
      const rect = (id) => { const e = doc.getElementById(id); return e && e.offsetParent !== null ? e.getBoundingClientRect() : null; };
      const portrait = H > W * 1.15;
      const phone = W < 720 || H < 520;
      const ctrl = 58;
      let coil, ladder, scope, spec;
      if (phone && portrait) {
        const meter = rect('meter');
        const top = (meter ? meter.bottom : 150) + 6;
        const bandH = 58;
        const specY = H - ctrl - bandH;
        const scopeY = specY - bandH - 6;
        const ladY = scopeY - 52;
        scope = { x: 10, y: scopeY, w: W - 20, h: bandH };
        spec = { x: 10, y: specY, w: W - 20, h: bandH };
        ladder = { x: 24, y: ladY, w: W - 48, h: 40, vertical: false, compact: true };
        const avail = ladY - 8 - top;
        const R = Math.max(40, Math.min(W * 0.43, avail / 2 - 6) / 1.12);
        coil = { cx: W / 2, cy: top + avail / 2 + 4, R };
      } else if (phone) {
        const bandH = 54;
        const y = H - ctrl - bandH;
        scope = { x: 10, y, w: W * 0.5 - 15, h: bandH };
        spec = { x: W * 0.5 + 5, y, w: W * 0.5 - 15, h: bandH };
        ladder = { x: 30, y: y - 40, w: W - 60, h: 34, vertical: false, compact: true };
        const top = 8, bottom = y - 46;
        const R = Math.max(40, Math.min((bottom - top) / 2 - 4, W * 0.2) / 1.12);
        coil = { cx: W * 0.5, cy: (top + bottom) / 2, R };
      } else {
        const bandH = U.clamp(H * 0.17, 96, 180);
        const y = H - ctrl - bandH;
        scope = { x: 16, y, w: W * 0.56 - 16, h: bandH };
        spec = { x: W * 0.56 + 10, y, w: W * 0.44 - 26, h: bandH };
        const meter = rect('meter');
        const ladTop = (meter ? meter.bottom : 200) + 34;
        ladder = { x: W - 118, y: ladTop, w: 12, h: Math.max(80, y - 38 - ladTop), vertical: true };
        const right = W - 236, bottom = y - 14;
        const cx = (16 + right) / 2, cy = (14 + bottom) / 2;
        const R = Math.max(60, Math.min((bottom - 14) / 2, (right - 16) / 2) / 1.22);
        coil = { cx, cy, R };
      }
      if (!this.hudVisible) {
        // text hidden: the coil takes the stage
        const R = Math.min(W, H - ctrl) * 0.4 / 1.1;
        coil = { cx: W / 2, cy: (H - ctrl) / 2 + 6, R };
      }
      const s = (b) => (b ? Object.assign({}, b, { x: b.x * u, y: b.y * u, w: b.w * u, h: b.h * u }) : null);
      this.box = { scope: s(scope), spec: s(spec), ladder: s(ladder) };
      this.cx = coil.cx * u; this.cy = coil.cy * u; this.R = coil.R * u;
      this.cx0 = this.cx; this.cy0 = this.cy;
      doc.documentElement.style.setProperty('--band-top', `${scope.y}px`);
      doc.documentElement.style.setProperty('--band-h', `${scope.h}px`);
    }

    adapt(ms) {
      const ft = this._frameTimes;
      ft.push(ms);
      if (ft.length < 90) return;
      const avg = ft.reduce((a, b) => a + b, 0) / ft.length;
      ft.length = 0;
      let q = this.quality;
      if (avg > 24 && q > 0.7) q = Math.max(0.7, q - 0.15);
      else if (avg < 13 && q < 1) q = Math.min(1, q + 0.1);
      if (q !== this.quality) { this.quality = q; this.resize(); }
    }

    // --------------------------------------------------------------- events
    push(ev) {
      const q = this.queue;
      let i = q.length;
      while (i > 0 && q[i - 1].t > ev.t) i--;
      q.splice(i, 0, ev);
    }
    clear() {
      this.queue.length = 0;
      for (const l of this.lanes.values()) l.clear();
      this.stamps.length = 0; this.label = null;
    }

    lane(id) {
      let l = this.lanes.get(id);
      if (!l) { l = new LaneView(id); this.lanes.set(id, l); }
      return l;
    }

    _drain(now) {
      const q = this.queue;
      let i = 0;
      while (i < q.length && q[i].t <= now) i++;
      if (!i) return;
      const due = q.splice(0, i);
      for (const ev of due) this.handle(ev, now, now - ev.t > 0.5);
    }

    clock(t) {
      const s = Math.max(0, t - (this.startClock || 0));
      const m = Math.floor(s / 60);
      return `${String(m).padStart(2, '0')}:${(s - m * 60).toFixed(2).padStart(5, '0')}`;
    }

    handle(ev, now, stale) {
      switch (ev.type) {
        case 'train': {
          const l = this.lane(ev.lane);
          l.seen = true;
          for (const t of ev.onsets) l.pending.push(t);
          l.chunks.push(ev);
          for (let i = 0; i < ev.rates.length; i++) l.keys.push(ev.rates[i]);
          break;
        }
        case 'section':
          if (this.startClock == null) this.startClock = ev.t;
          this.section = ev.meta; this.secIndex = ev.index; this.secStart = ev.t; this.secDur = ev.meta.dur;
          this.hueTarget = ev.meta.hue;
          this.label = null;
          if (this.hud) this.hud.section(ev);
          if (!stale && ev.index > 0) this._flash(ev.t, 0.5, ev.meta.hue);
          break;
        case 'bar':
          this.bars.push({ t: ev.t, dur: ev.barDur, n: this.barCount++ });
          if (this.bars.length > 24) this.bars.shift();
          this.beatsPerBar = Math.round(ev.steps / 4) || 4;
          this.barPulse = 1;
          break;
        case 'focus':
          this.focus = ev.lane;
          break;
        case 'stat':
          if (this.hud) this.hud.stat(ev.lines);
          break;
        case 'text':
          if (this.hud && !stale) this.hud.log(ev.text, this.clock(ev.t), ev.style && ev.style.hue);
          break;
        case 'stamp':
          if (!stale) {
            this.stamps.push({ t: ev.t, text: ev.text, hue: safeHue(ev.hue != null ? ev.hue : this.hue) });
            if (!this.reduced) this.shake = Math.max(this.shake, 0.8 * this.motion);
          }
          break;
        case 'label':
          this.label = { t: ev.t, text: ev.text, sub: ev.sub || '' };
          break;
        case 'chord':
          this.label = { t: ev.t, text: ev.label || '', sub: ev.sub || '', hold: true };
          break;
        case 'drum':
          if (ev.kind === 'clap' || ev.kind === 'snare') this.rings.push({ t: ev.t, hue: this.hue, vel: ev.vel });
          if (ev.kind === 'crash' && !stale) this._burst(24, this.hue);
          if (this.rings.length > 12) this.rings.shift();
          break;
        case 'flash':
          if (!stale) this._flash(ev.t, ev.amount, this.hue);
          break;
        case 'finale':
          if (!stale) this._burst(80, this.hue);
          break;
        default:
          break;
      }
    }

    _flash(t, amount, hue) {
      // governor: at most one full-screen flash per 0.6 s, never in reduced
      if (this.reduced || t - this.lastFlash < 0.6) return;
      this.lastFlash = t;
      this.flashAmt = Math.min(1, amount);
      this.flashHue = safeHue(hue);
    }

    // ------------------------------------------------------------ helpers
    // Continuous bar phase: bar number + fraction, from the recorded bars.
    phi(t) {
      const b = this.bars;
      if (!b.length) return t / 1.333;
      let i = b.length - 1;
      while (i > 0 && b[i].t > t) i--;
      const bar = b[i];
      return bar.n + (t - bar.t) / bar.dur;
    }
    accent(a = 1) { return U.hsl(safeHue(this.hue), 100, 65, a); }

    _burst(n, hue) {
      const k = this.reduced ? 0.35 : 1;
      for (let i = 0; i < n * k; i++) {
        const a = Math.random() * TAU, v = (0.2 + Math.random() * 0.9) * this.R;
        this.parts.push({ x: this.cx, y: this.cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, ttl: 0.6 + Math.random() * 0.8, hue: hue + (Math.random() - 0.5) * 40, s: 10 + Math.random() * 18 });
      }
    }

    _update(now, dt) {
      this.dt = dt;
      this.hue = U.approachHue(this.hue, this.hueTarget, 2.5, dt);
      this.flashAmt = Math.max(0, this.flashAmt - dt / 0.28);
      this.shake = Math.max(0, this.shake - dt / 0.35);
      this.barPulse = Math.max(0, this.barPulse - dt / 0.5);
      // lanes: move due onsets into history, find the current rate
      for (const l of this.lanes.values()) {
        const p = l.pending;
        while (l.pi < p.length && p[l.pi] <= now) { l.hist.push(p[l.pi]); l.lastOnset = p[l.pi]; l.pi++; this.kicks++; }
        if (l.pi > 4096) { p.splice(0, l.pi); l.pi = 0; }
        const k = l.keys;
        let j = k.length - 2;
        while (j >= 0 && k[j] > now) j -= 2;
        if (j >= 0) l.rate = k[j + 1];
        if (j > 64) { k.splice(0, j); }
        while (l.chunks.length && l.chunks[0].t1 < now - 0.4) l.chunks.shift();
        const gap = l.rate > 0 ? Math.max(1.6 / l.rate, 0.035) : 0.5;
        l.active = now - l.lastOnset < gap;
      }
      // particles from active lanes, at the coil's write head
      const hx = this.cx, hy = this.cy - this.R;
      for (const l of this.lanes.values()) {
        if (!l.active) continue;
        const rate = Math.min(l.rate, 50) * (this.reduced ? 0.25 : 0.6) * this.motion;
        let n = rate * dt;
        while (n > 0) {
          if (Math.random() < n) {
            const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
            const v = (0.08 + Math.random() * 0.35) * this.R * (0.6 + T.pitchness(l.rate));
            this.parts.push({ x: hx, y: hy, vx: Math.cos(a) * v - v * 0.8, vy: Math.sin(a) * v * 0.6, life: 0, ttl: 0.5 + Math.random() * 0.9, hue: l.hue, s: 6 + Math.random() * 10 });
          }
          n -= 1;
        }
      }
      const P = this.parts;
      for (let i = P.length - 1; i >= 0; i--) {
        const q = P[i];
        q.life += dt;
        if (q.life > q.ttl) { P[i] = P[P.length - 1]; P.pop(); continue; }
        const d = Math.exp(-1.6 * dt);
        q.vx *= d; q.vy *= d;
        q.vy += 0.05 * this.R * dt;
        q.x += q.vx * dt; q.y += q.vy * dt;
      }
      if (P.length > 900) P.splice(0, P.length - 900);
      while (this.stamps.length && now - this.stamps[0].t > 1.8) this.stamps.shift();
      if (this.label && !this.label.hold && now - this.label.t > 2.5) this.label = null;
    }

    // ----------------------------------------------------------------- draw
    _background(g, now) {
      const u = this.u;
      if (!this._bg) {
        // dot grid + vignette, rendered once per size
        const c = document.createElement('canvas');
        c.width = this.w; c.height = this.h;
        const b = c.getContext('2d');
        b.fillStyle = '#07060d';
        b.fillRect(0, 0, c.width, c.height);
        const step = 26 * u;
        b.fillStyle = 'rgba(170,180,255,0.07)';
        for (let y = step / 2; y < c.height; y += step) {
          for (let x = step / 2; x < c.width; x += step) b.fillRect(x - 0.75 * u, y - 0.75 * u, 1.5 * u, 1.5 * u);
        }
        const vg = b.createRadialGradient(this.cx, this.cy, this.R * 0.4, this.cx, this.cy, Math.max(c.width, c.height) * 0.75);
        vg.addColorStop(0, 'rgba(0,0,0,0)');
        vg.addColorStop(1, 'rgba(0,0,0,0.55)');
        b.fillStyle = vg;
        b.fillRect(0, 0, c.width, c.height);
        this._bg = c;
      }
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
      g.drawImage(this._bg, 0, 0);
      // accent glow behind the coil; brightens a little on each bar (≤ 1 Hz)
      const a = 0.16 + (this.reduced ? 0 : 0.05 * this.barPulse);
      const grd = g.createRadialGradient(this.cx, this.cy, 0, this.cx, this.cy, this.R * 1.5);
      grd.addColorStop(0, U.hsl(this.hue, 80, 28, a));
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(this.cx - this.R * 1.5, this.cy - this.R * 1.5, this.R * 3, this.R * 3);
    }

    _center(g, now) {
      const u = this.u, R = this.R;
      const f = this.lanes.get(this.focus);
      let big = '', sub = '';
      if (this.label) { big = this.label.text; sub = this.label.sub; }
      else if (f && f.rate > 0) {
        big = f.rate >= T.FUSION_HZ ? T.noteOf(f.rate).name : `${f.rate.toFixed(f.rate < 10 ? 2 : 1)} Hz`;
        sub = f.rate >= T.FUSION_HZ ? `${T.fmtHz(f.rate)} · ${T.fmtBpm(f.rate)} BPM` : 'separate pulses';
      }
      // dark hub so the text reads over the fused lines
      const hub = R * 0.3;
      const grd = g.createRadialGradient(this.cx, this.cy, 0, this.cx, this.cy, hub);
      grd.addColorStop(0, 'rgba(7,6,13,0.92)');
      grd.addColorStop(1, 'rgba(7,6,13,0)');
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = grd;
      g.fillRect(this.cx - hub, this.cy - hub, hub * 2, hub * 2);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      if (big) {
        let fs = Math.min(R * 0.2, 64 * u);
        g.font = `800 ${fs}px ${SANS}`;
        const w = g.measureText(big).width;
        if (w > R * 0.9) { fs *= (R * 0.9) / w; g.font = `800 ${fs}px ${SANS}`; }
        g.fillStyle = 'rgba(245,245,255,0.96)';
        g.fillText(big, this.cx, this.cy - fs * 0.15);
        if (sub) {
          g.font = `600 ${Math.max(9 * u, fs * 0.24)}px ${MONO}`;
          g.fillStyle = 'rgba(210,215,240,0.75)';
          g.fillText(sub, this.cx, this.cy + fs * 0.55);
        }
      }
      // pulse ⟷ pitch gauge under the hub
      if (f && f.rate > 0) {
        const p = T.pitchness(f.rate);
        const gw = Math.min(R * 0.55, 150 * u), gy = this.cy + R * 0.2 + 8 * u;
        const x0 = this.cx - gw / 2;
        g.fillStyle = 'rgba(200,205,235,0.18)';
        g.fillRect(x0, gy, gw, 2 * u);
        g.fillStyle = U.hsl(f.hue, 100, 70, 0.95);
        g.fillRect(x0 + gw * p - 3 * u, gy - 4 * u, 6 * u, 10 * u);
        g.font = `700 ${8.5 * u}px ${MONO}`;
        g.fillStyle = 'rgba(200,205,235,0.6)';
        g.textAlign = 'left'; g.fillText('PULSE', x0, gy + 13 * u);
        g.textAlign = 'right'; g.fillText('PITCH', x0 + gw, gy + 13 * u);
      }
    }

    _stamps(g, now) {
      const u = this.u;
      for (const s of this.stamps) {
        const k = (now - s.t) / 1.8;
        if (k < 0 || k > 1) continue;
        const inA = this.reduced ? U.smoothstep(0, 0.15, k) : 1;
        const alpha = inA * (1 - U.smoothstep(0.62, 1, k)) * (this.reduced ? 0.6 : 0.95);
        const pop = this.reduced ? 1 : 1 + 0.25 * Math.max(0, 1 - k / 0.07);
        const fs = Math.min(this.R * 0.3, this.w * 0.09) * pop;
        g.save();
        g.translate(this.cx, this.cy - this.R * 0.55);
        g.rotate(-0.1);
        g.globalAlpha = alpha;
        g.font = `900 ${fs}px ${SANS}`;
        const tw = g.measureText(s.text).width;
        // hazard-tape band
        const bw = tw + fs * 0.8, bh = fs * 1.15;
        g.globalCompositeOperation = 'source-over';
        g.fillStyle = 'rgba(7,6,13,0.8)';
        g.fillRect(-bw / 2, -bh / 2, bw, bh);
        g.save();
        g.beginPath(); g.rect(-bw / 2, -bh / 2, bw, bh * 0.12); g.rect(-bw / 2, bh * 0.38, bw, bh * 0.12); g.clip();
        g.fillStyle = U.hsl(s.hue, 100, 60, 1);
        const st = 14 * u;
        for (let x = -bw / 2 - bh; x < bw / 2 + bh; x += st * 2) {
          g.beginPath();
          g.moveTo(x, -bh / 2); g.lineTo(x + st, -bh / 2); g.lineTo(x + st + bh, bh / 2); g.lineTo(x + bh, bh / 2);
          g.closePath(); g.fill();
        }
        g.restore();
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillStyle = U.hsl(s.hue, 100, 72, 1);
        if (!this.reduced) {
          g.fillStyle = 'rgba(255,60,150,0.6)'; g.fillText(s.text, -3 * u, 0);
          g.fillStyle = 'rgba(60,230,255,0.6)'; g.fillText(s.text, 3 * u, 0);
          g.fillStyle = U.hsl(s.hue, 100, 78, 1);
        }
        g.fillText(s.text, 0, 0);
        g.restore();
      }
      g.globalAlpha = 1;
    }

    _particles(g) {
      const u = this.u;
      g.globalCompositeOperation = 'lighter';
      for (const q of this.parts) {
        const f = q.life / q.ttl;
        g.globalAlpha = (1 - f) * (1 - f) * 0.9;
        const s = q.s * u * (1 - 0.5 * f);
        g.drawImage(SPR.glow(q.hue), q.x - s / 2, q.y - s / 2, s, s);
      }
      g.globalAlpha = 1;
    }

    frame(now, dt, probe) {
      dt = Math.min(0.1, Math.max(0, dt));
      this._drain(now);
      this._update(now, dt);
      const g = this.g;
      // shake: small, only in full mode
      const sh = this.reduced ? 0 : this.shake * this.shake * 7 * this.u;
      this.cx = this.cx0 + (Math.random() - 0.5) * sh;
      this.cy = this.cy0 + (Math.random() - 0.5) * sh;

      this._background(g, now);
      C.guides(this, g, now);
      C.rings(this, g, now);
      const active = [];
      let idx = 0;
      for (const l of this.lanes.values()) {
        if (!l.hist.size) continue;
        C.lane(this, g, l, now, idx++);
        active.push(l);
      }
      C.toneRing(this, g, this.lanes.get(this.focus), now);
      this._particles(g);
      this._center(g, now);
      this._stamps(g, now);

      const focusLane = this.lanes.get(this.focus) || null;
      if (this.hudVisible) {
        L.draw(this, g, this.box.ladder, this.lanes.values(), this.focus, now);
        SC.scope(this, g, this.box.scope, active, focusLane, now);
        SC.spectrum(this, g, this.box.spec, probe ? probe.spec() : null, this.sampleRate, focusLane);
      }
      // flash overlay (governed, faint, never red)
      if (this.flashAmt > 0.01) {
        g.globalCompositeOperation = 'lighter';
        g.fillStyle = U.hsl(this.flashHue, 70, 55, 0.2 * this.flashAmt);
        g.fillRect(0, 0, this.w, this.h);
      }
      g.globalCompositeOperation = 'source-over';
      if (this.hud) {
        this.hud.meter(focusLane, this.kicks);
        if (this.section) this.hud.progress(this.secIndex, (now - this.secStart) / this.secDur);
      }
    }
  }

  X.Visuals = Visuals;
})(window.FP);
