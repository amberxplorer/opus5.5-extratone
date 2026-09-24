/* FUSION POINT — the coil.
 * Time wound onto a spiral: the write head sits at 12 o'clock on the rim,
 * and every kick that has fired is a dot that winds inwards as it ages,
 * turning once per bar of the meta tempo. Rhythms become spokes (a four-
 * on-the-floor kick lands on the same four angles every bar), polyrhythms
 * become spiral arms, and once the kicks come faster than the eye can
 * separate them the dots touch and fuse into one continuous line. Nothing
 * here flashes at the kick rate: dots are persistent marks that move
 * smoothly, so a 440 Hz train looks like a steady glowing thread. */
'use strict';
(function (X) {
  const U = X.U, T = X.T, TAU = U.TAU, SPR = X.Sprites;
  const C = {};

  C.WINDOW = 5.5;     // seconds of history on the coil
  C.INNER = 0.16;     // inner radius as a fraction of R

  // Screen position of an event that happened at time `t` (seen at `now`).
  C.pos = (V, t, now, laneOff) => {
    const age = now - t;
    const k = U.clamp(age / C.WINDOW, 0, 1);
    const r = V.R * (1 - (1 - C.INNER) * k) * (1 + laneOff);
    const ang = -Math.PI / 2 - TAU * (V.phi(now) - V.phi(t));
    return [V.cx + Math.cos(ang) * r, V.cy + Math.sin(ang) * r, k];
  };

  // Faint guides: one spiral per coil turn and a spoke on every beat.
  C.guides = function (V, g, now) {
    const u = V.u;
    g.globalCompositeOperation = 'source-over';
    g.strokeStyle = 'rgba(190,200,255,0.07)';
    g.lineWidth = 1 * u;
    g.beginPath();
    const steps = 360;
    for (let i = 0; i <= steps; i++) {
      const t = now - (i / steps) * C.WINDOW;
      const [x, y] = C.pos(V, t, now, 0);
      if (i) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.stroke();
    // beat spokes, rotating with the bar phase
    const ph = V.phi(now);
    const beats = V.beatsPerBar || 4;
    for (let b = 0; b < beats; b++) {
      const ang = -Math.PI / 2 - TAU * (ph - Math.floor(ph) - b / beats);
      const a = b === 0 ? 0.16 : 0.07;
      g.strokeStyle = `rgba(190,200,255,${a})`;
      g.beginPath();
      g.moveTo(V.cx + Math.cos(ang) * V.R * C.INNER, V.cy + Math.sin(ang) * V.R * C.INNER);
      g.lineTo(V.cx + Math.cos(ang) * V.R * 1.04, V.cy + Math.sin(ang) * V.R * 1.04);
      g.stroke();
    }
    // rim + write head
    g.strokeStyle = 'rgba(190,200,255,0.12)';
    g.beginPath();
    g.arc(V.cx, V.cy, V.R * 1.07, 0, TAU);
    g.stroke();
    g.fillStyle = V.accent(0.9);
    g.beginPath();
    const hx = V.cx, hy = V.cy - V.R * 1.07;
    g.moveTo(hx, hy + 2 * u);
    g.lineTo(hx - 7 * u, hy - 10 * u);
    g.lineTo(hx + 7 * u, hy - 10 * u);
    g.closePath();
    g.fill();
  };

  /* One lane. Consecutive kicks closer together in time than the ear can
   * separate are joined by a line whose opacity is the "pitchness" of that
   * gap (≈14 Hz: no line, ≈32 Hz: solid), and their dots fade out in turn,
   * so the picture fuses at the same rate the sound does. */
  C.lane = function (V, g, lane, now, idx) {
    const u = V.u, hist = lane.hist, n = hist.size;
    if (!n) return;
    const off = (idx - 1.5) * 0.014;
    const cap = 12000;
    const pts = V._pts || (V._pts = new Float32Array(4 * cap));
    let m = 0;
    for (let i = 0; i < n && m < cap; i++) {
      const t = hist.get(n - 1 - i); // newest first
      if (now - t > C.WINDOW) break;
      const [x, y, k] = C.pos(V, t, now, off);
      pts[m * 4] = x; pts[m * 4 + 1] = y; pts[m * 4 + 2] = k; pts[m * 4 + 3] = t;
      m++;
    }
    if (!m) return;
    const hue = lane.hue;
    // fusion of each point with its older neighbour
    const fuse = V._fuse || (V._fuse = new Float32Array(cap));
    for (let i = 0; i < m; i++) {
      const dtNext = i + 1 < m ? pts[i * 4 + 3] - pts[(i + 1) * 4 + 3] : 1;
      const dtPrev = i > 0 ? pts[(i - 1) * 4 + 3] - pts[i * 4 + 3] : 1;
      fuse[i] = T.pitchness(1 / Math.max(1e-4, Math.min(dtNext, dtPrev)));
    }
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round';
    g.lineJoin = 'round';
    // lines between neighbours, opacity = pitchness of the gap between them
    const gapP = V._gapP || (V._gapP = new Float32Array(cap));
    for (let i = 0; i + 1 < m; i++) gapP[i] = T.pitchness(1 / Math.max(1e-4, pts[i * 4 + 3] - pts[(i + 1) * 4 + 3]));
    for (const [w, al, l] of [[9, 0.1, 58], [2.4, 0.85, 74]]) {
      g.lineWidth = w * u;
      for (let band = 1; band <= 4; band++) {
        const lo = (band - 1) / 4, hi = band / 4;
        g.beginPath();
        let any = false;
        for (let i = 0; i + 1 < m; i++) {
          const f = gapP[i];
          if (f <= lo || f > hi) continue;
          g.moveTo(pts[i * 4], pts[i * 4 + 1]);
          g.lineTo(pts[(i + 1) * 4], pts[(i + 1) * 4 + 1]);
          any = true;
        }
        if (any) {
          g.strokeStyle = U.hsl(hue, 100, l, al * hi);
          g.stroke();
        }
      }
    }
    // dots for kicks that are still separate events; the newest ones swell
    const spr = SPR.glow(hue);
    g.fillStyle = U.hsl(hue, 100, 88, 1);
    for (let i = 0; i < m; i++) {
      const vis = 1 - fuse[i];
      if (vis < 0.03) continue;
      const x = pts[i * 4], y = pts[i * 4 + 1], k = pts[i * 4 + 2];
      const age = k * C.WINDOW;
      const pop = V.reduced ? 0 : Math.max(0, 1 - age / 0.3);
      const s = (22 + 30 * pop) * u * (1 - 0.5 * k);
      g.globalAlpha = 0.9 * vis * (1 - 0.7 * k);
      g.drawImage(spr, x - s / 2, y - s / 2, s, s);
      const r = (3.6 - 1.8 * k) * u;
      g.fillRect(x - r / 2, y - r / 2, r, r);
    }
    g.globalAlpha = 1;
  };

  /* Tone ring: once the focus lane is a pitch, one period of its actual
   * waveform is wrapped around the outside of the coil. A periodic signal
   * gives the same closed shape every cycle, so the ring holds still. */
  C.toneRing = function (V, g, lane, now) {
    if (!lane) return;
    // fade in and out smoothly (gated lanes switch many times a second)
    const target = lane.active && lane.rate > 0 ? T.pitchness(lane.rate) : 0;
    lane.ring = U.approach(lane.ring || 0, target, target > (lane.ring || 0) ? 14 : 3, V.dt);
    const p = lane.ring;
    if (p < 0.03 || !lane.hist.size || lane.rate <= 0) return;
    const u = V.u, per = 1 / lane.rate;
    let t0 = lane.hist.get(lane.hist.size - 1);
    for (let i = lane.hist.size - 1; i >= 0; i--) { const t = lane.hist.get(i); if (t <= now - per) { t0 = t; break; } }
    const N = 240, R0 = V.R * 1.16, A = V.R * 0.035;
    g.globalCompositeOperation = 'lighter';
    for (const [w, al, l] of [[7, 0.14, 60], [1.8, 0.9, 80]]) {
      g.strokeStyle = U.hsl(lane.hue, 100, l, al * p);
      g.lineWidth = w * u;
      g.beginPath();
      for (let i = 0; i <= N; i++) {
        const v = X.Scope.sampleAt([lane], t0 + (i / N) * per);
        const ang = -Math.PI / 2 + (i / N) * TAU;
        const r = R0 + U.clamp(v, -1.2, 1.2) * A;
        const x = V.cx + Math.cos(ang) * r, y = V.cy + Math.sin(ang) * r;
        if (i) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.stroke();
    }
  };

  // Shock rings for snares and claps: expand from the hub, slow and faint.
  C.rings = function (V, g, now) {
    const u = V.u;
    g.globalCompositeOperation = 'lighter';
    for (const r of V.rings) {
      const k = (now - r.t) / 0.45;
      if (k < 0 || k > 1) continue;
      const rad = V.R * (C.INNER + (1.1 - C.INNER) * U.easeOutCubic(k));
      g.strokeStyle = U.hsl(r.hue, 90, 70, 0.22 * (1 - k) * r.vel);
      g.lineWidth = (3 - 2 * k) * u;
      g.beginPath();
      g.arc(V.cx, V.cy, rad, 0, TAU);
      g.stroke();
    }
  };

  X.Coil = C;
})(window.FP);
