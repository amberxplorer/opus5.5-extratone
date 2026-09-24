/* FUSION POINT — the two instruments along the bottom.
 *
 * SCOPE: the kick bus (sum of all kick-train lanes), triggered on the focus
 * lane's latest kick, with a time base of about three periods. A periodic
 * signal stands still on a triggered scope, so the moment a train becomes a
 * pitch the trace freezes into one repeating shape. Dashed lines mark each
 * kick onset, one period T = 1/f apart.
 *
 * SPECTRUM: the master output, log frequency. A pulse train at f Hz has
 * energy only at f, 2f, 3f, …; the ticks mark where theory puts those
 * harmonics for the focus lane. */
'use strict';
(function (X) {
  const U = X.U, T = X.T;
  const SC = {};

  // Sum all lanes' rendered samples at absolute time t.
  function sampleAt(lanes, t) {
    let v = 0;
    for (const lane of lanes) {
      const ch = lane.chunks;
      for (let i = ch.length - 1; i >= 0; i--) {
        const c = ch[i];
        if (t >= c.t0 && t < c.t1) {
          const k = (t - c.t0) * c.sr;
          const j = k | 0;
          const a = c.samples[j] || 0, b = c.samples[j + 1] || a;
          v += (a + (b - a) * (k - j)) * (lane.level != null ? lane.level : 1);
          break;
        }
        if (c.t1 < t) break;
      }
    }
    return v;
  }

  SC.sampleAt = sampleAt;

  SC.scope = function (V, g, box, lanes, focusLane, now) {
    const u = V.u;
    const rate = focusLane && focusLane.rate > 0 ? focusLane.rate : 3;
    const win = U.clamp(3 / rate, 0.006, 0.16);
    // trigger: newest onset of the focus lane that leaves a full window behind it
    let trig = now - win;
    if (focusLane && focusLane.hist.size) {
      const h = focusLane.hist;
      for (let i = h.size - 1; i >= 0; i--) {
        const t = h.get(i);
        if (t <= now - win * 0.9) { trig = t; break; }
      }
    }
    const t0 = trig - win * 0.08;
    const n = Math.max(64, Math.floor(box.w / (1.5 * u)));
    const ys = V._scopeY || (V._scopeY = new Float32Array(4096));
    let peak = 1e-3;
    for (let i = 0; i < n; i++) {
      const v = sampleAt(lanes, t0 + (i / (n - 1)) * win);
      ys[i] = v;
      peak = Math.max(peak, Math.abs(v));
    }
    V.scopeGain = U.approach(V.scopeGain || 1, 0.9 / peak, peak * V.scopeGain > 1 ? 30 : 3, V.dt);

    // frame
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = 'rgba(8,8,18,0.72)';
    g.fillRect(box.x, box.y, box.w, box.h);
    g.strokeStyle = 'rgba(190,200,255,0.16)';
    g.lineWidth = 1 * u;
    g.strokeRect(box.x + 0.5, box.y + 0.5, box.w - 1, box.h - 1);
    const mid = box.y + box.h * 0.55;
    g.beginPath(); g.moveTo(box.x, mid); g.lineTo(box.x + box.w, mid); g.stroke();

    // onset markers (period grid)
    if (focusLane) {
      g.strokeStyle = U.hsl(focusLane.hue, 80, 70, 0.35);
      g.setLineDash([3 * u, 4 * u]);
      const h = focusLane.hist;
      for (let i = h.size - 1, c = 0; i >= 0 && c < 40; i--, c++) {
        const t = h.get(i);
        if (t < t0) break;
        if (t > t0 + win) continue;
        const x = box.x + ((t - t0) / win) * box.w;
        g.beginPath(); g.moveTo(x, box.y + 16 * u); g.lineTo(x, box.y + box.h); g.stroke();
      }
      g.setLineDash([]);
    }

    // trace: wide glow then core
    const hue = focusLane ? focusLane.hue : 80;
    const amp = box.h * 0.4 * V.scopeGain;
    g.globalCompositeOperation = 'lighter';
    g.lineJoin = 'round';
    for (const [w, a, l] of [[6, 0.14, 60], [1.8, 0.95, 78]]) {
      g.strokeStyle = U.hsl(hue, 100, l, a);
      g.lineWidth = w * u;
      g.beginPath();
      for (let i = 0; i < n; i++) {
        const x = box.x + (i / (n - 1)) * box.w;
        const y = mid - U.clamp(ys[i] * amp, -box.h * 0.52, box.h * 0.43);
        if (i) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.stroke();
    }
    // labels
    g.globalCompositeOperation = 'source-over';
    g.font = `700 ${10.5 * u}px ${V.MONO}`;
    g.textBaseline = 'top';
    g.textAlign = 'left';
    g.fillStyle = 'rgba(220,225,255,0.75)';
    const compact = box.w < 560 * u;
    g.fillText(compact ? 'KICK BUS' : 'KICK BUS · triggered on each kick', box.x + 8 * u, box.y + 6 * u);
    g.textAlign = 'right';
    g.fillText(compact ? `T = ${T.fmtMs(rate)}` : `${(win * 1000).toFixed(win < 0.01 ? 1 : 0)} ms window · T = ${T.fmtMs(rate)}`, box.x + box.w - 8 * u, box.y + 6 * u);
  };

  const FMIN = 20, FMAX = 8000;
  const fx = (box, f) => box.x + box.w * (Math.log(f / FMIN) / Math.log(FMAX / FMIN));

  SC.spectrum = function (V, g, box, spec, sampleRate, focusLane) {
    const u = V.u;
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = 'rgba(8,8,18,0.72)';
    g.fillRect(box.x, box.y, box.w, box.h);
    g.strokeStyle = 'rgba(190,200,255,0.16)';
    g.lineWidth = 1 * u;
    g.strokeRect(box.x + 0.5, box.y + 0.5, box.w - 1, box.h - 1);
    // decade grid
    g.font = `600 ${9.5 * u}px ${V.MONO}`;
    g.textBaseline = 'bottom';
    g.textAlign = 'center';
    for (const f of [50, 100, 200, 500, 1000, 2000, 5000]) {
      const x = fx(box, f);
      g.strokeStyle = 'rgba(190,200,255,0.08)';
      g.beginPath(); g.moveTo(x, box.y + 18 * u); g.lineTo(x, box.y + box.h); g.stroke();
      g.fillStyle = 'rgba(200,205,235,0.45)';
      g.fillText(f >= 1000 ? f / 1000 + 'k' : String(f), x, box.y + box.h - 2 * u);
    }
    const hue = focusLane ? focusLane.hue : 80;
    if (spec) {
      const bins = spec.length, binHz = sampleRate / 2 / bins;
      const n = Math.floor(box.w / (2 * u));
      g.beginPath();
      g.moveTo(box.x, box.y + box.h);
      for (let i = 0; i < n; i++) {
        const f = FMIN * Math.pow(FMAX / FMIN, i / (n - 1));
        const b = f / binHz;
        const j = Math.min(bins - 2, b | 0);
        const v = (spec[j] + (spec[j + 1] - spec[j]) * (b - j)) / 255;
        g.lineTo(box.x + (i / (n - 1)) * box.w, box.y + box.h - 12 * u - v * (box.h - 34 * u));
      }
      g.lineTo(box.x + box.w, box.y + box.h);
      g.closePath();
      g.fillStyle = U.hsl(hue, 90, 55, 0.35);
      g.fill();
      g.strokeStyle = U.hsl(hue, 100, 75, 0.9);
      g.lineWidth = 1.4 * u;
      g.stroke();
    }
    // predicted harmonics of the focus lane
    const rate = focusLane && focusLane.active ? focusLane.rate : 0;
    g.textBaseline = 'top';
    g.textAlign = 'left';
    g.fillStyle = 'rgba(220,225,255,0.75)';
    g.font = `700 ${10.5 * u}px ${V.MONO}`;
    const compact = box.w < 560 * u;
    g.fillText(compact ? 'SPECTRUM' : 'SPECTRUM · master', box.x + 8 * u, box.y + 6 * u);
    g.textAlign = 'right';
    const binHz = sampleRate / 2 / (spec ? spec.length : 4096);
    if (rate >= 2 * binHz) {
      g.fillText(compact ? `n × ${T.fmtHz(rate)}` : `harmonics at n × ${T.fmtHz(rate)}`, box.x + box.w - 8 * u, box.y + 6 * u);
      g.strokeStyle = U.hsl(hue, 100, 80, 0.55);
      g.fillStyle = U.hsl(hue, 100, 85, 0.9);
      g.font = `700 ${9 * u}px ${V.MONO}`;
      g.textAlign = 'center';
      for (let k = 1; k * rate <= FMAX && k <= 64; k++) {
        const f = k * rate;
        if (f < FMIN) continue;
        const x = fx(box, f);
        g.beginPath(); g.moveTo(x, box.y + 20 * u); g.lineTo(x, box.y + 27 * u); g.stroke();
        if (k <= 4 && x - fx(box, (k - 1 || 0.5) * rate) > 14 * u) g.fillText(k === 1 ? 'f' : k + 'f', x, box.y + 29 * u);
      }
    } else if (rate > 0) {
      g.fillText(compact ? `n × ${T.fmtHz(rate)} (unresolved)` : `harmonics every ${T.fmtHz(rate)}: finer than these ${binHz.toFixed(1)} Hz bins`, box.x + box.w - 8 * u, box.y + 6 * u);
    }
  };

  X.Scope = SC;
})(window.FP);
