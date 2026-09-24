/* FUSION POINT — the tempo ladder.
 * One logarithmic axis, labelled twice: BPM on one side, Hz and note names
 * on the other. Genre landmarks sit at the bottom, notes at the top, and
 * the fusion zone (roughly 14–32 Hz, where pulses turn into pitch) is the
 * shaded band in between. Every active lane is a marker on it. */
'use strict';
(function (X) {
  const U = X.U, T = X.T;
  const L = {};

  const lg = Math.log;
  L.frac = (bpm) => U.clamp((lg(bpm) - lg(T.LADDER_MIN)) / (lg(T.LADDER_MAX) - lg(T.LADDER_MIN)), 0, 1);

  // box: {x, y, w, h, vertical}
  L.draw = function (V, g, box, lanes, focus, now) {
    const u = V.u, vert = box.vertical;
    // position along the axis (0 = slow end)
    const P = (bpm) => {
      const f = L.frac(bpm);
      return vert ? [box.x + box.w * 0.5, box.y + box.h * (1 - f)] : [box.x + box.w * f, box.y + box.h * 0.5];
    };
    const mono = (px, w = 600) => `${w} ${px * u}px ${V.MONO}`;
    g.globalCompositeOperation = 'source-over';
    g.textBaseline = 'middle';

    // fusion zone
    const [zx0, zy0] = P(T.hzToBpm(14)), [zx1, zy1] = P(T.hzToBpm(32));
    const grd = vert ? g.createLinearGradient(0, zy0, 0, zy1) : g.createLinearGradient(zx0, 0, zx1, 0);
    grd.addColorStop(0, 'rgba(120,255,220,0)');
    grd.addColorStop(0.5, 'rgba(120,255,220,0.16)');
    grd.addColorStop(1, 'rgba(120,255,220,0)');
    g.fillStyle = grd;
    if (vert) g.fillRect(box.x, zy1, box.w, zy0 - zy1);
    else g.fillRect(zx0, box.y, zx1 - zx0, box.h);

    // axis
    const [ax0, ay0] = P(T.LADDER_MIN), [ax1, ay1] = P(T.LADDER_MAX);
    g.strokeStyle = 'rgba(200,210,255,0.35)';
    g.lineWidth = 1.5 * u;
    g.beginPath(); g.moveTo(ax0, ay0); g.lineTo(ax1, ay1); g.stroke();

    // octave ticks (every doubling of 60 BPM)
    g.strokeStyle = 'rgba(200,210,255,0.22)';
    for (let bpm = T.LADDER_MIN; bpm <= T.LADDER_MAX; bpm *= 2) {
      const [x, y] = P(bpm);
      g.beginPath();
      if (vert) { g.moveTo(x - 4 * u, y); g.lineTo(x + 4 * u, y); } else { g.moveTo(x, y - 4 * u); g.lineTo(x, y + 4 * u); }
      g.stroke();
    }

    // landmarks: genre names on the BPM side, notes on the Hz side
    const small = box.compact ? 9 : 10.5;
    for (const lm of T.LANDMARKS) {
      const [x, y] = P(lm.bpm);
      const isNote = lm.kind === 'note';
      const col = lm.kind === 'fusion' ? 'rgba(140,255,225,0.95)' : isNote ? 'rgba(220,225,255,0.75)' : 'rgba(255,240,200,0.8)';
      g.fillStyle = col;
      g.strokeStyle = col;
      g.lineWidth = 1 * u;
      if (vert) {
        g.beginPath(); g.moveTo(x - 7 * u, y); g.lineTo(x + 7 * u, y); g.stroke();
        g.font = mono(small, isNote ? 600 : 700);
        g.textAlign = 'right';
        g.fillText(isNote ? T.group(lm.bpm) : lm.label, x - 11 * u, y);
        g.textAlign = 'left';
        g.fillStyle = 'rgba(200,205,235,0.6)';
        g.font = mono(small - 1, 500);
        g.fillText(isNote ? `${lm.label} ${lm.note}` : lm.note, x + 11 * u, y);
      } else if (!box.compact || ['speedcore', 'extratone', 'A1', 'A4'].includes(lm.label)) {
        g.beginPath(); g.moveTo(x, y - 6 * u); g.lineTo(x, y + 6 * u); g.stroke();
        g.font = mono(small, 700);
        g.textAlign = 'center';
        g.fillText(lm.label, x, y - 13 * u);
      }
    }
    // end captions
    g.fillStyle = 'rgba(200,205,235,0.55)';
    g.font = mono(small - 0.5, 700);
    if (vert) {
      g.textAlign = 'center';
      g.fillText('PITCH', ax1, ay1 - 14 * u);
      g.fillText('RHYTHM', ax0, ay0 + 14 * u);
    } else {
      g.textAlign = 'left'; g.fillText('RHYTHM', ax0, ay0 + 16 * u);
      g.textAlign = 'right'; g.fillText('PITCH', ax1, ay1 + 16 * u);
    }

    // lane markers
    let i = 0;
    for (const lane of lanes) {
      if (!lane.active) continue;
      const bpm = T.hzToBpm(lane.rate);
      const [x, y] = P(bpm);
      const isF = lane.id === focus;
      const s = (isF ? 9 : 6) * u;
      g.fillStyle = U.hsl(lane.hue, 100, isF ? 70 : 62, isF ? 1 : 0.85);
      g.beginPath();
      if (vert) {
        const xx = x + (isF ? 0 : ((i % 3) - 1) * 4 * u);
        g.moveTo(xx - 2 * u, y); g.lineTo(xx - 2 * u - s * 1.6, y - s); g.lineTo(xx - 2 * u - s * 1.6, y + s);
      } else {
        g.moveTo(x, y - 2 * u); g.lineTo(x - s, y - 2 * u - s * 1.6); g.lineTo(x + s, y - 2 * u - s * 1.6);
      }
      g.closePath();
      g.fill();
      if (isF) {
        g.strokeStyle = U.hsl(lane.hue, 100, 70, 0.9);
        g.lineWidth = 2 * u;
        g.beginPath();
        if (vert) { g.moveTo(box.x, y); g.lineTo(box.x + box.w, y); } else { g.moveTo(x, box.y); g.lineTo(x, box.y + box.h); }
        g.stroke();
      }
      i++;
    }
  };

  X.Ladder = L;
})(window.FP);
