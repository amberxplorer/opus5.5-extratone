/* FUSION POINT — pre-rendered glow sprites. Drawing a cached radial-gradient
 * bitmap with additive blending is far cheaper than shadowBlur. */
'use strict';
(function (X) {
  const cache = new Map();

  function make(hue, sat, size) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const r = size / 2;
    const grd = g.createRadialGradient(r, r, 0, r, r, r);
    grd.addColorStop(0, `hsla(${hue},${sat}%,96%,1)`);
    grd.addColorStop(0.18, `hsla(${hue},${sat}%,72%,0.85)`);
    grd.addColorStop(0.45, `hsla(${hue},${sat}%,56%,0.28)`);
    grd.addColorStop(1, `hsla(${hue},${sat}%,50%,0)`);
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
    return c;
  }

  X.Sprites = {
    // Hue is quantised to 10° so there are at most 36 × 2 bitmaps.
    glow(hue, sat = 100) {
      const h = Math.round((((hue % 360) + 360) % 360) / 10) * 10 % 360;
      const key = h + ':' + sat;
      let s = cache.get(key);
      if (!s) { s = make(h, sat, 64); cache.set(key, s); }
      return s;
    },
    white() { return this.glow(0, 0); },
  };
})(window.FP);
