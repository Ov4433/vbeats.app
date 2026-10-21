/* Sequencer — one-bar step sequencer for the studio page.
   Pattern model + generation live in pattern-logic.js (pure, tested);
   this file is the grid UI and the Web Audio playback engine. */
(function () {
  const L = window.PatternLogic;
  if (!L) return;
  const grid = document.getElementById('seq-grid');
  if (!grid) return;
  const $ = id => document.getElementById(id);

  let pattern = L.emptyPattern(95);
  let playing = false, curStep = 0, timer = null, nextTime = 0, actx = null;

  /* Change hook — the single choke point for pattern mutations. Every
     edit path funnels through render(): cell toggles call it directly,
     Clear calls it, and every co-producer action goes through
     setPattern(), which calls it. (The BPM input is the one exception —
     it nudges pattern.bpm without a re-render, so it calls changed()
     itself.) The studio page uses this to autosave a draft; playback
     never touches it. */
  let onChange = null;
  function changed() {
    if (!onChange) return;
    try { onChange(pattern); } catch (e) { /* a broken save hook must never break the grid */ }
  }

  const ROWS = [
    { key: 'kick', label: 'Kick', cls: 'seq-drums' },
    { key: 'snare', label: 'Snare', cls: 'seq-drums' },
    { key: 'hat', label: 'Hats', cls: 'seq-drums' },
    { key: 'bass', label: 'Bass', cls: 'seq-bass', note: true, onNote: L.BASS_ROOT },
    { key: 'melody', label: 'Melody', cls: 'seq-mel', note: true, onNote: 69 },
  ];

  /* ---------- grid ---------- */
  function render() {
    grid.innerHTML = '';
    ROWS.forEach(row => {
      const label = document.createElement('div');
      label.className = 'seq-label';
      label.textContent = row.label;
      grid.appendChild(label);
      pattern[row.key].forEach((v, i) => {
        const c = document.createElement('button');
        c.type = 'button';
        c.className = 'seq-cell ' + row.cls + (v ? ' on' : '') + (i % 4 === 0 ? ' beat' : '');
        c.dataset.row = row.key; c.dataset.step = i;
        if (row.note && v != null) c.textContent = L.noteName(v);
        c.setAttribute('aria-label', row.label + ' step ' + (i + 1));
        c.onclick = () => {
          if (row.note) pattern[row.key][i] = (pattern[row.key][i] != null) ? null : row.onNote;
          else pattern[row.key][i] = pattern[row.key][i] ? 0 : 1;
          render();
        };
        grid.appendChild(c);
      });
    });
    markStep();
    changed();
  }
  function markStep() {
    grid.querySelectorAll('.seq-cell').forEach(c =>
      c.classList.toggle('now', playing && +c.dataset.step === curStep));
  }

  /* ---------- audio (all synthesized — no samples) ----------
     Voices are parameterized by (context, destination) so the exact same
     sound design drives live playback AND the offline publish render —
     there is one set of voices, not a copy for each path. */
  const noiseBufs = new WeakMap();
  function noiseBuffer(a) {
    let b = noiseBufs.get(a);
    if (!b) {
      b = a.createBuffer(1, a.sampleRate * 0.5, a.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      noiseBufs.set(a, b);
    }
    return b;
  }
  function ctx() {
    if (!actx) {
      actx = new (window.AudioContext || window.webkitAudioContext)();
      noiseBuffer(actx);
    }
    if (actx.state === 'suspended') actx.resume();
    return actx;
  }
  const mf = m => 440 * Math.pow(2, (m - 69) / 12);
  function kick(a, dest, t) {
    const o = a.createOscillator(), g = a.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.12);
    g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
    o.connect(g).connect(dest); o.start(t); o.stop(t + 0.26);
  }
  function noiseHit(a, dest, t, dur, filterType, freq, vol) {
    const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    s.buffer = noiseBuffer(a); f.type = filterType; f.frequency.value = freq;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(dest); s.start(t); s.stop(t + dur + 0.02);
  }
  function snare(a, dest, t) { noiseHit(a, dest, t, 0.16, 'bandpass', 1800, 0.5); }
  function hat(a, dest, t) { noiseHit(a, dest, t, 0.05, 'highpass', 7200, 0.22); }
  function tone(a, dest, t, midi, type, vol, dur) {
    const o = a.createOscillator(), f = a.createBiquadFilter(), g = a.createGain();
    o.type = type; o.frequency.value = mf(midi);
    f.type = 'lowpass'; f.frequency.value = type === 'triangle' ? 700 : 2600;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(f).connect(g).connect(dest); o.start(t); o.stop(t + dur + 0.02);
  }
  function playStepInto(a, dest, pat, i, t) {
    if (pat.kick[i]) kick(a, dest, t);
    if (pat.snare[i]) snare(a, dest, t);
    if (pat.hat[i]) hat(a, dest, t);
    if (pat.bass[i] != null) tone(a, dest, t, pat.bass[i], 'triangle', 0.5, 0.22);
    if (pat.melody[i] != null) tone(a, dest, t, pat.melody[i], 'square', 0.14, 0.18);
  }
  function playStep(i, t) { playStepInto(actx, actx.destination, pattern, i, t); }

  /* Render the current pattern — the bar looped `bars` times (default 4) —
     to a WAV blob, offline, with the same voices as live playback.
     A short tail is appended so the last hits decay instead of clipping. */
  async function renderWav(bars) {
    const loops = bars || 4;
    const sr = 44100;
    const stepDur = 60 / pattern.bpm / 4;
    const totalSteps = L.STEPS * loops;
    const frames = Math.ceil((stepDur * totalSteps + 0.3) * sr);
    const off = new OfflineAudioContext(2, frames, sr);
    for (let s = 0; s < totalSteps; s++) {
      playStepInto(off, off.destination, pattern, s % L.STEPS, 0.05 + s * stepDur);
    }
    const buf = await off.startRendering();
    const wav = L.encodeWav([buf.getChannelData(0), buf.getChannelData(1)], buf.sampleRate);
    return new Blob([wav], { type: 'audio/wav' });
  }
  function scheduler() {
    const stepDur = 60 / pattern.bpm / 4;
    while (nextTime < actx.currentTime + 0.12) {
      const step = curStep, t = nextTime;
      setTimeout(() => { curStep = step; markStep(); }, Math.max(0, (t - actx.currentTime) * 1000));
      playStep(step, t);
      nextTime += stepDur;
      curStep = (step + 1) % L.STEPS;
    }
  }

  /* ---------- transport ---------- */
  $('seq-play').onclick = () => {
    if (playing) {
      playing = false; clearInterval(timer);
      $('seq-play').textContent = '▶ Play';
      markStep();
      return;
    }
    ctx();
    playing = true; curStep = 0; nextTime = actx.currentTime + 0.06;
    $('seq-play').textContent = '■ Stop';
    timer = setInterval(scheduler, 25);
  };
  $('seq-clear').onclick = () => { pattern = L.emptyPattern(pattern.bpm); render(); };
  $('seq-bpm').addEventListener('input', e => {
    const v = parseInt(e.target.value, 10);
    if (v >= 40 && v <= 240) { pattern.bpm = v; changed(); }
  });

  window.StudioSeq = {
    getPattern: () => pattern,
    setPattern: (p) => { pattern = p; $('seq-bpm').value = p.bpm; render(); },
    render,
    renderWav,
    setOnChange: (fn) => { onChange = typeof fn === 'function' ? fn : null; },
  };
  render();
})();
