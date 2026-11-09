/* Live adapter — wires the demo modules to the live studio, without
   copying demo-session.js (which duplicates coproducer.js and auto-runs
   the cold open, which is out).
   Both, per Star, Nov 8:
   1. Hum-to-beat leads with recording: record yourself humming a beat,
      it listens, and makes it a beat. Mic capture is on-device via
      DemoHum.captureBar; on mic failure it falls back to the scripted
      safety net and says so, never hangs.
   2. Spats + Forte loop: spats are checked after every live crew action,
      with the locked rails; Forte loop is theme in, suggestion out.
   No live Meta API call is made here. Voice Transcribe / Spark stay
   stubbed in demo-voice.js until Star decides on credits / paid use.
   Safe no-op if the modules or the cards are absent. */
(function () {
  const L = window.PatternLogic, S = window.StudioSeq;
  const H = window.DemoHum, SP = window.DemoSpats, SF = window.DemoSafety;
  if (!L || !S) return;
  const $ = id => document.getElementById(id);

  function say(bat, text) {
    const logEl = $('cop-log') || $('demo-log');
    if (!logEl) return;
    const d = document.createElement('div');
    d.className = 'cop-line';
    d.innerHTML = '<b></b><span></span>';
    d.querySelector('b').textContent = bat + ':';
    d.querySelector('span').textContent = ' ' + text;
    logEl.prepend(d);
  }

  /* ---------- Spats, with the locked rails ---------- */
  let spatState = SP ? SP.newSession() : null;
  let activeSpat = null;
  function checkSpats() {
    if (!SP || !spatState) return;
    const spatEl = $('live-spat');
    if (!spatEl) return;
    const spat = SP.evaluate(L, S.getPattern(), spatState);
    if (!spat) return;
    activeSpat = spat;
    spatEl.style.display = '';
    spatEl.innerHTML = '';
    const t = document.createElement('p');
    t.className = 'note';
    t.textContent = 'A spat — ' + spat.trigger + ' (' + spat.metric + '). Rails: one line each, Volt referees, you have the gavel.';
    spatEl.appendChild(t);
    spat.lines.forEach(l => {
      const d = document.createElement('div');
      d.className = 'cop-line';
      d.innerHTML = '<b></b><span></span>';
      d.querySelector('b').textContent = l.bat + ':';
      d.querySelector('span').textContent = ' ' + l.text;
      spatEl.appendChild(d);
    });
    const ref = document.createElement('p');
    ref.className = 'note';
    ref.textContent = 'Volt (referee): ' + spat.proposal;
    spatEl.appendChild(ref);
    const doBtn = document.createElement('button');
    doBtn.className = 'btn small'; doBtn.textContent = 'Do it — settle it with the change';
    const leaveBtn = document.createElement('button');
    leaveBtn.className = 'btn small ghost'; leaveBtn.textContent = 'Leave it — keep the pattern';
    doBtn.onclick = () => settleSpat('apply');
    leaveBtn.onclick = () => settleSpat('leave');
    spatEl.appendChild(doBtn); spatEl.appendChild(leaveBtn);
  }
  function settleSpat(choice) {
    if (!SP || !activeSpat) return;
    const r = SP.resolve(L, S.getPattern(), activeSpat, choice, spatState);
    spatState = r.state;
    if (r.changed) S.setPattern(r.pattern);
    say('Volt', choice === 'apply'
      ? 'Settled — the change is in. The crew moves on; the gavel stays with you.'
      : 'Settled — kept as-is. Your call, your bar.');
    activeSpat = null;
    const spatEl = $('live-spat');
    if (spatEl) { spatEl.style.display = 'none'; spatEl.innerHTML = ''; }
  }
  // Coproducer registered its onclick handlers first, so these listeners
  // run after the pattern has already changed — exactly when a spat check belongs.
  ['cop-volt', 'cop-bass', 'cop-forte', 'cop-gwei', 'cop-strip', 'cop-desc-go'].forEach(id => {
    const el = $(id);
    if (el) el.addEventListener('click', () => setTimeout(checkSpats, 0));
  });

  /* ---------- Scripted safety net ---------- */
  function runScripted() {
    if (!SF) return;
    const r = SF.runScripted(L, S.getPattern());
    S.setPattern(r.pattern);
    r.log.forEach(l => say(l.bat, l.line));
    say('Volt', 'Scripted safety net — hook verdict on the scripted bar: ' + r.hookVerdict + '.');
    checkSpats();
  }
  const scriptedBtn = $('live-scripted');
  if (scriptedBtn) scriptedBtn.onclick = runScripted;

  /* ---------- Hum-to-beat: record yourself humming, it listens, makes a beat ---------- */
  function runHum() {
    if (!H) { say('Forte', 'Hum module is not loaded on this page.'); return; }
    const p0 = S.getPattern();
    say('Forte', 'Hum it — one bar, into the mic. Pitch detection runs on-device; nothing leaves this browser.');
    H.captureBar(p0.bpm,
      (step, midi) => {
        const note = $('live-hum-note');
        if (note) note.textContent = midi == null ? 'listening… step ' + (step + 1) : 'heard ' + L.noteName(midi) + ' (step ' + (step + 1) + ')';
      },
      observed => {
        const lane = H.notesToMelodyLane(observed);
        const p = S.getPattern();
        const styleEl = $('cop-style');
        if (!L.trackHits(p.kick)) {
          const f = L.buildFrame(styleEl ? styleEl.value : 'boombap');
          p.kick = f.kick; p.snare = f.snare; p.hat = f.hat; p.bpm = f.bpm;
        }
        lane.notes.forEach(n => { p.melody[n.step] = n.midi; });
        p.bass = L.rideBassline(p);
        S.setPattern(p);
        say('Forte', 'Your hum, cleaned up to the scale — ' + lane.notes.length + ' notes on the grid. ' +
          'Volt framed it, Bass rode under it, vocal space is still open. (Rough hums snap to the nearest scale note — that cleanup is the charm.)');
        const t = L.fiveSecondTest(p);
        say('Gwei', 'Hook test on your hum: ' + t.verdict + ' — ' + t.reasons[0] + '.');
        checkSpats();
      },
      err => {
        say('Forte', 'Mic unavailable (' + (err && err.message ? err.message : 'no permission') + ') — falling back to the scripted run so the demo never dies.');
        runScripted();
      });
  }
  const humBtn = $('live-hum');
  if (humBtn) humBtn.onclick = runHum;

  /* ---------- Forte loop: theme in, suggestion out ---------- */
  const forteGo = $('live-forte-go');
  if (forteGo) forteGo.onclick = () => {
    const theme = ($('live-forte-theme') ? $('live-forte-theme').value : '').trim();
    if (!theme) {
      say('Forte', 'Write the theme first — in my home, before the session. That is the loop: what you write there is what I bring in here.');
      return;
    }
    const low = theme.toLowerCase();
    const cues = [];
    if (/anthem|hackathon|event|crowd/.test(low)) cues.push('anthem energy — something a crowd can chant');
    if (/night|3 ?am|alone|late/.test(low)) cues.push('late-night, alone-in-the-room feeling');
    if (/own|receipt|property|mine/.test(low)) cues.push('ownership — the payoff is the property itself');
    if (/love/.test(low)) cues.push('love-song warmth');
    say('Forte', 'Noted from my home — your theme: "' + theme + '". ' +
      (cues.length ? 'So in this session I will lean toward ' + cues.join('; ') + '.' : 'I will carry that theme into the session.') +
      ' Write it there, hear it here — that is the loop, live.');
  };

  window.LiveAdapter = { checkSpats, runHum, runScripted };
})();
