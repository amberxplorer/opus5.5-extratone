/* FUSION POINT — boot, warning screen, controls.
 * Nothing makes a sound or draws a single flash until the listener has
 * read the photosensitivity warning and pressed Start.
 *
 * URL options (for demos / debugging):
 *   ?section=4  start at section IV     ?seed=1234  fixed variation
 *   ?reduced=1  start in reduced-flashing mode
 *   ?hq=1       never lower the render resolution (for screen captures)
 *   ?lite=1|0   force the lighter synth voices on or off (default: on for touch devices) */
'use strict';
(function (X) {
  const $ = (id) => document.getElementById(id);
  const SECTIONS = X.SECTIONS.slice().sort((a, b) => a.order - b.order);
  const params = new URLSearchParams(location.search);
  const mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const prefersReduced = !!(mq && mq.matches);

  let ctx = null, engine = null, conductor = null, visuals = null, hud = null;
  let running = false, started = false, reduced = prefersReduced || params.get('reduced') === '1';
  let lastTs = 0, probe = null;
  const hq = params.get('hq') === '1';

  // ------------------------------------------------------ warning screen
  const reducedToggle = $('reducedToggle');
  reducedToggle.checked = reduced;
  $('rmNote').hidden = !prefersReduced;
  $('startBtn').addEventListener('click', start);
  $('startBtn').focus({ preventScroll: true });

  function start() {
    if (started) return;
    started = true;
    reduced = reducedToggle.checked;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) {
      $('warnBody').insertAdjacentHTML('beforeend', '<p><strong>Sorry: this browser has no Web Audio support.</strong></p>');
      return;
    }
    // iOS: play through the silent switch like a music app would.
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* optional */ }
    // Keep a phone screen awake for the three minutes (optional).
    try {
      if (navigator.wakeLock) navigator.wakeLock.request('screen').catch(() => {});
    } catch { /* optional */ }
    ctx = new AC({ latencyHint: 'interactive' });
    const vol = Number($('startVol').value);
    $('vol').value = String(vol);
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    const lite = params.has('lite') ? params.get('lite') === '1' : coarse;
    engine = new X.Engine(ctx, { volume: vol, lite });
    hud = new X.Hud(document);
    hud.reduced = reduced;
    visuals = new X.Visuals($('stage'), hud, {
      reduced, motion: prefersReduced ? 0.6 : 1, sampleRate: ctx.sampleRate,
    });
    visuals.setHudVisible(true);
    const seed = params.has('seed') ? Number(params.get('seed')) >>> 0 : undefined;
    conductor = new X.Conductor(engine, SECTIONS, { seed, onEvent: (ev) => visuals.push(ev) });

    const waveBuf = new Float32Array(engine.analyser.fftSize);
    const specBuf = new Uint8Array(engine.analyser.frequencyBinCount);
    probe = {
      sampleRate: ctx.sampleRate,
      wave: () => { engine.analyser.getFloatTimeDomainData(waveBuf); return waveBuf; },
      spec: () => { engine.analyser.getByteFrequencyData(specBuf); return specBuf; },
    };

    const first = params.has('section') ? Math.min(SECTIONS.length, Math.max(1, Number(params.get('section')) || 1)) - 1 : 0;
    const go = () => {
      conductor.start(first, ctx.currentTime + 0.12);
      conductor.run();
      running = true;
    };
    if (ctx.state === 'suspended') ctx.resume().then(go, go);
    else go();

    $('warning').hidden = true;
    $('controls').hidden = false;
    visuals.setHudVisible(true); // again, now the panels have their final size
    updateFlashButton();
    armIdle();
    requestAnimationFrame(loop);
  }

  // ------------------------------------------------------------ frame loop
  function audioNow() {
    const lat = ctx.outputLatency || ctx.baseLatency || 0;
    return ctx.currentTime - lat;
  }
  function loop(ts) {
    const dt = lastTs ? (ts - lastTs) / 1000 : 1 / 60;
    lastTs = ts;
    if (running) {
      visuals.frame(audioNow(), dt, probe);
      if (!hq) visuals.adapt(dt * 1000);
    }
    requestAnimationFrame(loop);
  }

  // -------------------------------------------------------------- controls
  function stop() {
    if (!running) return;
    running = false;
    engine.hardStop(); // gain → 0 at currentTime, then suspend
    conductor.halt();
    const b = $('btnStop');
    b.innerHTML = '&#9654; Play';
    b.classList.add('paused');
  }
  function play() {
    if (running || !engine) return;
    engine.resume().then(() => {
      conductor.run();
      running = true;
    });
    const b = $('btnStop');
    b.innerHTML = '&#9632; Stop';
    b.classList.remove('paused');
  }
  function toggle() { if (running) stop(); else play(); }
  function mute() {
    engine.setMuted(!engine.muted);
    $('btnMute').textContent = engine.muted ? 'Unmute' : 'Mute';
    $('btnMute').setAttribute('aria-pressed', String(engine.muted));
  }
  function jump(delta) {
    if (!conductor) return;
    visuals.clear();
    conductor.jump(conductor.secIdx + delta);
    if (!running) play();
  }
  function jumpTo(idx) {
    if (!conductor) return;
    visuals.clear();
    conductor.jump(idx);
    if (!running) play();
  }
  function updateFlashButton() {
    const b = $('btnFlash');
    b.textContent = reduced ? 'Flashing: reduced' : 'Flashing: full';
    b.setAttribute('aria-pressed', String(reduced));
  }
  function toggleFlash() {
    reduced = !reduced;
    visuals.setReduced(reduced);
    updateFlashButton();
  }
  function toggleHud() {
    visuals.setHudVisible(!visuals.hudVisible);
    $('btnHud').setAttribute('aria-pressed', String(!visuals.hudVisible));
  }
  function fullscreen() {
    const el = document.documentElement;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
  }

  $('btnStop').addEventListener('click', toggle);
  $('btnMute').addEventListener('click', mute);
  $('btnPrev').addEventListener('click', () => jump(-1));
  $('btnNext').addEventListener('click', () => jump(1));
  $('btnFlash').addEventListener('click', toggleFlash);
  $('btnHud').addEventListener('click', toggleHud);
  $('btnFull').addEventListener('click', fullscreen);
  $('vol').addEventListener('input', (e) => { if (engine) engine.setVolume(Number(e.target.value)); });

  document.addEventListener('keydown', (e) => {
    if (e.target && e.target.tagName === 'INPUT' && e.target.type === 'range' && e.key.startsWith('Arrow')) return;
    if (!started) {
      if (e.key === 'Enter' && document.activeElement !== $('startBtn') && e.target.tagName !== 'INPUT') start();
      return;
    }
    const k = e.key;
    if (k === ' ' || k === 'Spacebar') { e.preventDefault(); toggle(); }
    else if (k === 'Escape') stop();
    else if (k === 'm' || k === 'M') mute();
    else if (k === 'ArrowRight' || k === 'n' || k === 'N') jump(1);
    else if (k === 'ArrowLeft' || k === 'p' || k === 'P') jump(-1);
    else if (k === 'f' || k === 'F') toggleFlash();
    else if (k === 'h' || k === 'H') toggleHud();
    else if (/^[1-8]$/.test(k)) jumpTo(Number(k) - 1);
    else return;
    wake();
  });

  window.addEventListener('resize', () => { if (visuals) visuals.resize(); });
  // Expose for the dev tools in tools/ (screenshots, offline video).
  X.app = { get conductor() { return conductor; }, get visuals() { return visuals; }, get engine() { return engine; } };
  // A wake lock is dropped whenever the page is hidden; ask again on return.
  document.addEventListener('visibilitychange', () => {
    try {
      if (!document.hidden && running && navigator.wakeLock) navigator.wakeLock.request('screen').catch(() => {});
    } catch { /* optional */ }
  });

  // Controls fade out when the pointer is idle.
  let idleTimer = 0;
  function wake() {
    document.body.classList.remove('idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => document.body.classList.add('idle'), 3000);
  }
  function armIdle() {
    ['pointermove', 'pointerdown', 'touchstart'].forEach((ev) => document.addEventListener(ev, wake, { passive: true }));
    wake();
  }
})(window.FP);
