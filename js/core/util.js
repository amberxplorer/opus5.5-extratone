/* FUSION POINT — core utilities.
 * Everything in this project hangs off window.FP so the page works from
 * file:// without modules or a build step. */
'use strict';
window.FP = window.FP || {};

(function (X) {
  const U = {};
  const TAU = Math.PI * 2;
  U.TAU = TAU;

  // ---------------------------------------------------------------- random
  // mulberry32: tiny, fast, good enough for music decisions.
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Mix several integers into one 32-bit seed.
  U.hashSeed = function (...parts) {
    let h = 0x811c9dc5;
    for (const p of parts) {
      let v = (p | 0) >>> 0;
      for (let i = 0; i < 4; i++) {
        h ^= v & 0xff;
        h = Math.imul(h, 0x01000193) >>> 0;
        v >>>= 8;
      }
    }
    return h >>> 0;
  };

  class Rng {
    constructor(seed) {
      this.seed = seed >>> 0;
      this.f = mulberry32(this.seed);
    }
    next() { return this.f(); }
    range(a, b) { return a + (b - a) * this.f(); }
    int(a, b) { return a + Math.floor((b - a + 1) * this.f()); } // inclusive
    chance(p) { return this.f() < p; }
    pick(arr) { return arr[Math.floor(this.f() * arr.length)]; }
    sign() { return this.f() < 0.5 ? -1 : 1; }
    weighted(items, weights) {
      let total = 0;
      for (const w of weights) total += w;
      let r = this.f() * total;
      for (let i = 0; i < items.length; i++) {
        r -= weights[i];
        if (r <= 0) return items[i];
      }
      return items[items.length - 1];
    }
    shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(this.f() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }
    fork(salt) { return new Rng(U.hashSeed(this.seed, salt, Math.floor(this.f() * 1e9))); }
  }
  U.Rng = Rng;

  // ------------------------------------------------------------------ maths
  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.mod = (a, n) => ((a % n) + n) % n;
  U.smoothstep = (a, b, x) => {
    const t = U.clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  U.easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  U.easeInCubic = (t) => t * t * t;
  U.easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  U.gcd = (a, b) => {
    a = Math.abs(a); b = Math.abs(b);
    while (b) [a, b] = [b, a % b];
    return a;
  };
  U.log2 = Math.log2;
  U.cents = (ratio) => 1200 * Math.log2(ratio);
  // Shortest signed distance between two positions on a unit circle.
  U.circDelta = (from, to) => {
    let d = U.mod(to - from, 1);
    if (d > 0.5) d -= 1;
    return d;
  };
  // Approach a target exponentially, frame-rate independent.
  U.approach = (cur, target, rate, dt) => target + (cur - target) * Math.exp(-rate * dt);
  U.approachHue = (cur, target, rate, dt) => {
    let d = U.mod(target - cur + 180, 360) - 180;
    return U.mod(target - d * Math.exp(-rate * dt), 360);
  };

  // ------------------------------------------------------------- formatting
  const MINUS = '−';
  U.MINUS = MINUS;
  U.signed = (v, digits = 1) => {
    const s = Math.abs(v).toFixed(digits);
    if (Number(s) === 0) return '±' + s;
    return (v < 0 ? MINUS : '+') + s;
  };
  U.fmtCents = (v, digits = 1) => U.signed(v, digits) + '¢';
  U.fmtNum = (v, digits = 1) => (v < 0 ? MINUS : '') + Math.abs(v).toFixed(digits);
  const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
  U.superscript = (n) => String(n).split('').map((d) => SUP[+d] || d).join('');
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
  U.roman = (n) => ROMAN[n - 1] || String(n);

  // ------------------------------------------------------------------ colour
  U.hsl = (h, s, l, a = 1) => `hsla(${h.toFixed(1)},${s}%,${l}%,${a.toFixed(3)})`;
  // Pitch position on the period (0..1) → hue. C sits at magenta, the circle
  // of hues runs with pitch so colour *is* pitch class.
  U.hueOfPos = (pos) => U.mod(pos * 360 + 300, 360);

  X.U = U;
})(window.FP);
