/* FUSION POINT — DOM heads-up display: section header, the tachometer
 * readout (BPM / Hz / note / period / kicks fired) and the lab log. */
'use strict';
(function (X) {
  const U = X.U, T = X.T;

  class Hud {
    constructor(doc) {
      const $ = (id) => doc.getElementById(id);
      this.doc = doc;
      this.root = $('hud');
      this.el = {
        num: $('secNum'), count: $('secCount'), title: $('secTitle'), sub: $('secSub'),
        stat: $('stat'), timeline: $('timeline'),
        bpm: $('bpmVal'), hz: $('hzVal'), ms: $('msVal'), note: $('noteVal'), kicks: $('kickVal'),
        mode: $('modeVal'), meter: $('meter'), log: $('log'), lane: $('laneVal'),
      };
      this.reduced = false;
      this._last = {};
      this.segs = [];
      this.maxLog = 5;
    }

    setVisible(v) {
      this.root.classList.toggle('hidden', !v);
    }

    section(ev) {
      const m = ev.meta, e = this.el;
      e.num.textContent = String(m.num).padStart(2, '0');
      e.count.textContent = String(ev.count).padStart(2, '0');
      e.title.textContent = m.title;
      e.sub.textContent = m.subtitle;
      this.doc.documentElement.style.setProperty('--acc', m.hue);
      if (!this.segs.length || this.segs.length !== ev.all.length) {
        e.timeline.textContent = '';
        const total = ev.all.reduce((s, x) => s + x.dur, 0);
        this.segs = ev.all.map((s) => {
          const d = this.doc.createElement('span');
          d.style.flexGrow = String(s.dur / total);
          d.title = `${s.num} · ${s.title}`;
          const i = this.doc.createElement('i');
          d.appendChild(i);
          e.timeline.appendChild(d);
          return { el: d, fill: i };
        });
      }
      this.segs.forEach((s, i) => {
        s.el.classList.toggle('on', i === ev.index);
        s.el.classList.toggle('done', i < ev.index);
        s.fill.style.transform = i < ev.index ? 'scaleX(1)' : 'scaleX(0)';
      });
      e.title.classList.remove('pop');
      void e.title.offsetWidth;
      e.title.classList.add('pop');
    }

    progress(index, frac) {
      const s = this.segs[index];
      if (s) s.fill.style.transform = `scaleX(${U.clamp(frac, 0, 1).toFixed(4)})`;
    }

    stat(lines) {
      const ul = this.el.stat;
      ul.textContent = '';
      for (const l of lines) {
        const li = this.doc.createElement('li');
        li.textContent = l;
        ul.appendChild(li);
      }
    }

    log(text, clock, hue) {
      const ol = this.el.log;
      const li = this.doc.createElement('li');
      const ts = this.doc.createElement('span');
      ts.className = 'ts';
      ts.textContent = clock;
      const tx = this.doc.createElement('span');
      tx.className = 'tx';
      tx.textContent = text;
      if (hue != null) li.style.setProperty('--h', hue);
      li.appendChild(ts);
      li.appendChild(tx);
      li.className = 'new';
      ol.appendChild(li);
      while (ol.children.length > this.maxLog) ol.removeChild(ol.firstChild);
      for (let i = 0; i < ol.children.length; i++) {
        ol.children[i].style.opacity = String(0.35 + 0.65 * ((i + 1) / ol.children.length));
      }
    }
    clearLog() { this.el.log.textContent = ''; }

    // Called every frame; only touches the DOM when a value changes.
    meter(lane, kicks) {
      const set = (k, v) => {
        if (this._last[k] === v) return;
        this._last[k] = v;
        this.el[k].textContent = v;
      };
      if (lane && lane.rate > 0) {
        const hz = lane.rate;
        set('bpm', T.fmtBpm(hz));
        set('hz', T.fmtHz(hz));
        set('ms', T.fmtMs(hz));
        const p = T.pitchness(hz);
        set('note', hz >= T.FUSION_HZ ? T.noteLabel(hz) : 'pulse');
        set('mode', p < 0.25 ? 'RHYTHM' : p > 0.75 ? 'PITCH' : 'FUSING');
        set('lane', lane.name);
        const act = lane.active ? '1' : '0';
        if (this._last.act !== act) { this._last.act = act; this.el.meter.classList.toggle('idle', !lane.active); }
        const pp = (Math.round(p * 20) / 20).toFixed(2);
        if (this._last.p !== pp) { this._last.p = pp; this.el.meter.style.setProperty('--p', pp); }
        const hue = String(lane.hue);
        if (this._last.hue !== hue) { this._last.hue = hue; this.el.meter.style.setProperty('--lh', hue); }
      }
      // round the counter in reduced mode so the low digits don't churn
      set('kicks', T.group(this.reduced ? Math.floor(kicks / 100) * 100 : kicks));
    }
  }

  X.Hud = Hud;
})(window.FP);
