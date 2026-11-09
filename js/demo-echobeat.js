/* DemoEcho — Echobeatification (canonical spec §3a, LOCKED Oct 26).
   AI given the bats' traits, not just bats as characters.
   Echolocation becomes Echobeatification: echo becomes beat.
   Scene (spec, in order):
     - Producer sitting, app up, humming words as he writes them in the
       notepad, just trying to find his way.
     - V Team asks: "would you like to let us try to match that echo?"
     - He keeps repeating it. Bats lean their ear in to him, eyes closed.
     - Load screen IS their ears — no generic spinner. Instead a
       radar-like homing device sweeps, homes in on the echo, and locks.
       One sweep, lock, then the beat drops (tight 2-3 second beat).
     - On lock, label: "Echobeatification: echo becomes beat".
   Honest split: radar/echo is OUR visualization for browser pitch
   detection + crew listening. Voice Transcribe hears words, Spark
   arranges the pattern. Do NOT claim Meta does echolocation literally.
   No live Meta API call is made here. Pattern building uses the
   studio's own PatternLogic, exactly like the other crew actions.
   UMD: pure logic testable in node; DOM wiring is browser-only. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DemoEcho = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const STAGES = ['ask', 'listen', 'radar', 'lock', 'beat'];
  const ASK_LINE = 'Would you like to let us try to match that echo?';
  const LOCK_LABEL = 'Echobeatification: echo becomes beat';
  const RADAR_MS = 2500; // tight 2-3 second beat, not a separate loading scene

  /* Radar progress: elapsed / total, clamped 0..1. Locked at 1. */
  function radarProgress(elapsedMs, totalMs) {
    const total = totalMs || RADAR_MS;
    if (!elapsedMs || elapsedMs <= 0) return 0;
    if (elapsedMs >= total) return 1;
    return elapsedMs / total;
  }
  function isLocked(progress) { return progress >= 1; }

  /* Build the beat the echo becomes, from PatternLogic alone.
     frameStyle: boombap/trap/house/drill. Returns a pattern object
     (caller sets it on the sequencer). No audio, no network. */
  function buildEchoBeat(L, frameStyle) {
    if (!L) return null;
    const p = L.emptyPattern(95);
    const f = L.buildFrame(frameStyle || 'boombap');
    p.kick = f.kick; p.snare = f.snare; p.hat = f.hat; p.bpm = f.bpm;
    p.bass = L.rideBassline(p);
    return p;
  }

  /* Browser-only UI wiring. Runs at script load (demo.html loads
     scripts at the end of body, so the card is already parsed).
     Safe no-op in node / when the card is absent. */
  function wireBrowser() {
    if (typeof document === 'undefined') return;
    const $ = id => document.getElementById(id);
    const askBtn = $('echo-ask');
    if (!askBtn) return;
    const stage = $('echo-stage'), radar = $('echo-radar'),
      progressEl = $('echo-progress'), labelEl = $('echo-label'),
      confirmRow = $('echo-confirm'), yesBtn = $('echo-yes'),
      noBtn = $('echo-no'), repeatEl = $('echo-repeat');
    let timer = null;

    function log(bat, text) {
      const logEl = $('demo-log');
      if (!logEl) return;
      const d = document.createElement('div');
      d.className = 'cop-line';
      const b = document.createElement('b'); b.textContent = bat + ':';
      const s = document.createElement('span'); s.textContent = ' ' + text;
      d.appendChild(b); d.appendChild(s);
      logEl.prepend(d);
    }
    function stopRadar() {
      if (timer) { clearInterval(timer); timer = null; }
    }
    function lockAndDrop() {
      stopRadar();
      if (labelEl) labelEl.textContent = LOCK_LABEL;
      if (stage) stage.classList.add('echo-locked');
      if (progressEl) progressEl.textContent = 'Locked — echo becomes beat.';
      log('Volt', LOCK_LABEL);
      const L = root.PatternLogic, S = root.StudioSeq;
      if (L && S) {
        const styleEl = $('demo-style');
        const p = buildEchoBeat(L, styleEl ? styleEl.value : 'boombap');
        if (p) {
          S.setPattern(p);
          log('Forte', 'Your echo, turned into a beat — frame up, bass under it, vocal space still open.');
          log('Gwei', 'Hook test on the echo beat — listen for the first five seconds.');
        }
      } else {
        log('Volt', 'Echo locked. (Sequencer not loaded on this page, so no pattern was written.)');
      }
    }
    function startRadar(words) {
      if (stage) stage.style.display = '';
      if (stage) stage.classList.add('echo-listening');
      if (repeatEl) repeatEl.textContent = 'Repeating: "' + words + '" — bats lean their ear in, eyes closed.';
      if (labelEl) labelEl.textContent = 'Matching echo…';
      if (progressEl) progressEl.textContent = 'Radar homing in on the echo… 0%';
      if (radar) radar.classList.add('echo-sweeping');
      log('Volt', 'Listening like bats — ears in, eyes closed, homing in on your echo.');
      const started = Date.now();
      stopRadar();
      timer = setInterval(() => {
        const progress = radarProgress(Date.now() - started, RADAR_MS);
        const pct = Math.round(progress * 100);
        if (progressEl) progressEl.textContent = 'Radar homing in on the echo… ' + pct + '%';
        if (radar) radar.setAttribute('data-progress', String(pct));
        if (isLocked(progress)) lockAndDrop();
      }, 50);
    }

    askBtn.onclick = () => {
      const words = ($('echo-notepad') ? $('echo-notepad').value : '').trim();
      if (!words) {
        log('Forte', 'Write the words first — in the notepad, like the producer in the scene. That is what we match the echo to.');
        return;
      }
      log('Volt', ASK_LINE);
      if (confirmRow) confirmRow.style.display = '';
    };
    if (yesBtn) yesBtn.onclick = () => {
      const words = ($('echo-notepad') ? $('echo-notepad').value : '').trim();
      if (confirmRow) confirmRow.style.display = 'none';
      startRadar(words);
    };
    if (noBtn) noBtn.onclick = () => {
      stopRadar();
      if (confirmRow) confirmRow.style.display = 'none';
      if (stage) stage.style.display = 'none';
      log('Volt', 'Your call — we will keep it as-is. The crew stays quiet until you call them.');
    };
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', wireBrowser);
    } else {
      wireBrowser();
    }
  }

  return { STAGES, ASK_LINE, LOCK_LABEL, RADAR_MS,
    radarProgress, isLocked, buildEchoBeat, wireBrowser };
});
