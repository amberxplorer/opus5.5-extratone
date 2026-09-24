# Extratone Demo — "FUSION POINT"

Owner: Amber. (Claude goes by Mio in this project.)

## Goal
A single-page website that performs a ~3 minute piece of generative
**extratone** written entirely in JavaScript, then re-seeds and plays a new
variation. Extratone is kick drums at 1000+ BPM, so fast they fuse into a
pitch. The piece is a tour of that fusion point, from a 180 BPM gabber kick,
through an accelerando to 1000 BPM, to tempos that play melodies and chords,
and back down again. The screen explains the theory as it happens: tempo ↔ Hz,
note names, periods, harmonic spectra and polyrhythm ratios.

Optimise for desktop, but the page must stay usable and legible on phones
(portrait and landscape).

## Signature elements (keep these distinctive)
- **The coil**: time wound onto a spiral, one turn per bar. Each kick is a dot
  that winds inwards as it ages. Kicks closer together than about 1/14 s get
  joined by a line whose opacity is the "pitchness" of that gap, so the picture
  fuses at the same rate the sound does.
- **Tone ring**: once the focus lane is a pitch, one period of its real
  waveform is wrapped around the coil.
- **Tempo ladder**: one log axis labelled in BPM *and* Hz/notes, with genre
  landmarks, the fusion zone and a marker for every active lane.
- **Triggered scope** of the kick bus (stands still once a train is periodic)
  and a **spectrum** with the predicted harmonics n × f ticked on top.
- **Tachometer** readout (BPM, Hz, period, note, kicks fired) and a lab log.

## Hard constraints
- No audio samples and no external libraries. Sound is Web Audio; kick trains
  are rendered sample by sample in JS (`js/audio/kicktrain.js`) and played as
  sample-contiguous AudioBufferSource chunks. Visuals use Canvas 2D directly.
- Plain HTML/CSS/JS that runs by opening `index.html` from disk (file://) and
  from GitHub Pages. No build step, no ES modules, no AudioWorklet (worklet
  modules don't load from file:// everywhere). Every script is a classic
  script that attaches to `window.FP`, loaded in order by `index.html`.
- System fonts only. Nothing is fetched from the network.

## Accuracy rule (theory labels)
Every number or claim on screen must be true. Compute BPM, Hz, periods, note
names, cents and ratios with `js/theory/tempo.js` instead of hand-typing
numbers. Genre tempo ranges are community conventions, so label them as
approximate ("≈150–200", "1000+"). Historical claims must be checkable
(Rhythmicon: Cowell & Theremin, 1931; Kontakte: Stockhausen, 1958–60).
Every new caption gets an assertion in `tools/theory-check.mjs`.

## Photosensitivity (required, and stricter than usual)
This genre invites strobing at the kick rate, which would sit right in the
3–30 Hz range that triggers photosensitive seizures. So:
- **Never change brightness at the kick rate.** Kicks are persistent marks
  that move smoothly; fusion is shown by joining them, never by blinking.
- Full-screen flashes are rate-limited in the renderer (one per 0.6 s at most,
  low opacity, never red). Sections cannot bypass this.
- A warning screen comes first and nothing plays until Start is pressed.
- Reduced-flashing mode (pre-selected by `prefers-reduced-motion`): no
  flashes, no shake, no pops, gentler stamps, the kick counter rounded.

## Quality checks
- No console errors on load or during playback.
- Master chain: glue compressor → limiter → soft clipper; the kick lanes have
  their own bus compressor, and every kick table has loudness matching so a
  440 Hz train is not louder than a 4 Hz kick.
- Stop (button, Space, Esc) cuts audio instantly: gain to 0 at `currentTime`,
  then the AudioContext is suspended. Mute (M) keeps the visuals running.
- Visuals: sprite glow (no `shadowBlur`), capped DPR, adaptive quality.

## Architecture
```
index.html              markup: canvas, HUD, warning screen, controls
css/style.css
js/core/util.js         FP.U: RNG, maths, formatting, colour
js/theory/tempo.js      FP.T: BPM ↔ Hz ↔ notes, ramps, ratios, landmarks
js/audio/engine.js      FP.Engine: master chain, buses, reverb, delay, ducking
js/audio/kicktrain.js   FP.K: kick tables and Lane (the extratone synth)
js/audio/synths.js      FP.S: snares, hats, claps, risers, hoover, screech, pad
js/music/kit.js         FP.Kit: patterns, gates, grooves, riffs
js/music/sections/*     one file per section
js/music/conductor.js   FP.Conductor: look-ahead scheduler, lanes, events
js/visual/*.js          sprites, coil, ladder, scope/spectrum, HUD, renderer
js/main.js              boot, warning screen, controls, keyboard
tools/                  Playwright checks, offline renders (dev only)
```
Sections talk to the outside world only through `api` (`api.train`,
`api.lane`, `api.focus`, `api.play`, `api.drum`, `api.fx`, `api.text`,
`api.stamp`, `api.stat`, `api.chord`, `api.event`). Every call takes an
absolute audio time; the conductor forwards a matching event so the picture
lines up with the sound. Pitches in sections are **Hz** (every pitch is also
a tempo); `Kit.m(midi)` converts MIDI numbers.

A kick-train segment: `api.train(lane, t0, t1, { rate: Hz | fn(t), phase?:
fn(t), gain: n | fn(t), kick: 'gabber'|'punch'|'zap'|'thud'|'snare', speed,
tie, fadeIn, fadeOut })`. Untied segments fire on their first sample; `tie`
continues the phase of the previous segment; `phase` gives an absolute phase
function (used for the phase-locked Risset layers).

## Testing
```
node tools/theory-check.mjs                                 # on-screen theory facts
NODE_PATH=$(npm root -g) node tools/check.mjs both          # desktop + phone: console errors, screenshots
NODE_PATH=$(npm root -g) node tools/check.mjs reduced       # reduced-motion start
NODE_PATH=$(npm root -g) node tools/render-audio.mjs        # offline render per section: levels, spectrograms
NODE_PATH=$(npm root -g) node tools/render-audio.mjs full   # whole piece → WAV + MP3
node tools/build-bundle.mjs out.html                        # single-file HTML
```
Outputs go to `tools/out/` (git-ignored). Look at screenshots and
spectrograms before claiming something works. `?hq=1` keeps full resolution
for captures; `?section=N`, `?seed=N`, `?reduced=1`, `?lite=1` also work.

Section lengths come from `bars` and `bpm`/`bpmAt` in each section file;
`render-audio.mjs` prints every section's duration and the total.

## Deployment
GitHub Pages serves `main` from the repository root. The README links the
live demo at the top: https://amberxplorer.github.io/opus5.5-extratone/
