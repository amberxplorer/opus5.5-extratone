/* FUSION POINT — offline video driver (dev tool, injected by render-video.mjs).
 * Renders the audio with an OfflineAudioContext, records every conductor
 * event, then steps the real renderer frame by frame on a virtual clock.
 * The spectrum is fed from the rendered audio through an FFT that mimics
 * the engine's AnalyserNode (8192 points, smoothing 0.6), so the video
 * matches the live page. */
'use strict';
(function (X) {
  const SECS = X.SECTIONS.slice().sort((a, b) => a.order - b.order);
  const N = 8192;
  const V = {};

  const sectionDuration = (sec) => X.Conductor.duration(sec);

  // In-place iterative radix-2 FFT.
  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = (-2 * Math.PI) / len;
      const wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < len / 2; k++) {
          const a = i + k, b = a + len / 2;
          const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
          re[b] = re[a] - tr; im[b] = im[a] - ti;
          re[a] += tr; im[a] += ti;
          const ncr = cr * wr - ci * wi;
          ci = cr * wi + ci * wr;
          cr = ncr;
        }
      }
    }
  }

  const win = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const x = i / N; // Blackman, as AnalyserNode uses
    win[i] = 0.42 - 0.5 * Math.cos(2 * Math.PI * x) + 0.08 * Math.cos(4 * Math.PI * x);
  }

  V.prepare = async function (seed, fps, tail = 1.2) {
    document.getElementById('warning').hidden = true;
    document.getElementById('controls').hidden = true;
    const sr = 44100;
    let body = 0;
    for (const s of SECS) body += sectionDuration(s);
    const start = 0.1, stopAt = start + body;
    const seconds = stopAt + tail + 0.5;
    const ctx = new OfflineAudioContext(2, Math.ceil(sr * seconds), sr);
    const E = new X.Engine(ctx, { volume: 1 });
    const events = [];
    const errors = [];
    const cond = new X.Conductor(E, SECS, { seed, onEvent: (ev) => events.push(ev) });
    const chunk = 0.25;
    cond.start(0, start);
    cond.scheduleUntil(chunk + 0.3);
    for (let t = chunk; t < seconds - 0.1; t += chunk) {
      const tt = t;
      ctx.suspend(tt).then(() => {
        try {
          if (tt < stopAt) cond.scheduleUntil(Math.min(tt + chunk + 0.3, stopAt - 0.001));
          else cond.running = false;
        } catch (e) { errors.push(String(e && e.stack || e)); cond.running = false; }
        ctx.resume();
      });
    }
    const buf = await ctx.startRendering();
    V.buf = buf;
    V.sr = sr;
    const L = buf.getChannelData(0), R = buf.getChannelData(1);
    V.mono = new Float32Array(L.length);
    for (let i = 0; i < L.length; i++) V.mono[i] = 0.5 * (L[i] + R[i]);
    V.duration = stopAt + tail;
    V.fps = fps;
    V.frames = Math.ceil(V.duration * fps);

    const hud = new X.Hud(document);
    V.vis = new X.Visuals(document.getElementById('stage'), hud, { reduced: false, sampleRate: sr });
    V.vis.setHudVisible(true);
    for (const ev of events) if (ev.t < stopAt - 0.001) V.vis.push(ev);

    const wave = new Float32Array(N), spec = new Uint8Array(N / 2), smooth = new Float32Array(N / 2);
    const re = new Float32Array(N), im = new Float32Array(N);
    V.probe = {
      sampleRate: sr,
      wave: () => {
        const end = Math.floor(V.t * sr);
        for (let i = 0; i < N; i++) { const k = end - N + i; wave[i] = k >= 0 && k < V.mono.length ? V.mono[k] : 0; }
        return wave;
      },
      spec: () => {
        V.probe.wave();
        for (let i = 0; i < N; i++) { re[i] = wave[i] * win[i]; im[i] = 0; }
        fft(re, im);
        for (let k = 0; k < N / 2; k++) {
          const mag = Math.hypot(re[k], im[k]) / N;
          smooth[k] = 0.6 * smooth[k] + 0.4 * mag;
          const db = 20 * Math.log10(smooth[k] + 1e-12);
          spec[k] = Math.max(0, Math.min(255, Math.round((255 * (db + 100)) / 70)));
        }
        return spec;
      },
    };
    return { frames: V.frames, duration: V.duration, events: events.length, errors };
  };

  V.frame = function (i) {
    V.t = i / V.fps;
    V.vis.frame(V.t, 1 / V.fps, V.probe);
  };

  // 16-bit WAV of [0, duration) as base64.
  V.wav = function () {
    const buf = V.buf, ch = 2, len = Math.min(buf.length, Math.ceil(V.duration * V.sr)), sr = V.sr;
    const out = new DataView(new ArrayBuffer(44 + len * ch * 2));
    const w = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); out.setUint32(4, 36 + len * ch * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
    out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true);
    out.setUint32(24, sr, true); out.setUint32(28, sr * ch * 2, true); out.setUint16(32, ch * 2, true);
    out.setUint16(34, 16, true); w(36, 'data'); out.setUint32(40, len * ch * 2, true);
    const d0 = buf.getChannelData(0), d1 = buf.getChannelData(1);
    let o = 44;
    for (let i = 0; i < len; i++) {
      for (const d of [d0, d1]) {
        const v = Math.max(-1, Math.min(1, d[i]));
        out.setInt16(o, v < 0 ? v * 32768 : v * 32767, true); o += 2;
      }
    }
    const bytes = new Uint8Array(out.buffer);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  };

  window.XV = V;
})(window.FP);
