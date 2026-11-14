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
   LIVE CREW (Meta API, wired Nov 12 — Star: make the crew live):
   - Spark brains: when a key is saved in this browser AND a live test
     has succeeded (DemoVoice.status().live), crew suggestion lines come
     from Spark 1.3 via thinkLive() — one SHORT prompt per user tap,
     one call max per action, never on page load, never without a key.
     Every live line is tagged LIVE, every fallback line Scripted.
   - Transcribe ears: the "Say it" button records a short vocal take
     and sends the file to transcribeAudioFile(); the transcript is shown
     and then runs through the existing typed describe-a-beat path.
     Realtime WebSocket transcription is NOT wired (out of scope).
   - Muse Image cover art is NOT wired (next step — see report).
   On any failure, timeout (30s, in demo-voice.js), or no key, the crew
   falls back to the existing scripted lines and says so.
   Safe no-op if the modules or the cards are absent. */
(function () {
  const L = window.PatternLogic, S = window.StudioSeq;
  const H = window.DemoHum, SP = window.DemoSpats, SF = window.DemoSafety;
  const DV = window.DemoVoice;
  if (!L || !S) return;
  const $ = id => document.getElementById(id);

  /* ---------- Live mode: key saved AND a live test succeeded ----------
     No key, or no successful test yet, means scripted — never a silent
     live call, never a live call on page load. */
  function liveMode() {
    try {
      return !!(DV && DV.hasLocalKey() && DV.status && DV.status().live);
    } catch (e) { return false; }
  }
  let liveBusy = false; // at most one live call in flight
  function refreshCrewBadge() {
    const el = $('crew-mode');
    if (!el) return;
    el.textContent = liveMode()
      ? 'Crew: LIVE — Spark 1.3 (one short paid call per tap, a few cents each)'
      : 'Crew: Scripted — save your Meta API key below and pass the live test to go live. Scripted lines still work.';
  }
  refreshCrewBadge();
  document.addEventListener('vbeats-voice-state', refreshCrewBadge);

  function say(bat, text, mode) {
    const logEl = $('cop-log') || $('demo-log');
    if (!logEl) return;
    const d = document.createElement('div');
    d.className = 'cop-line';
    d.innerHTML = '<b></b><span></span>';
    d.querySelector('b').textContent = bat + ':';
    d.querySelector('span').textContent = ' ' + text;
    if (mode === 'live' || mode === 'scripted') {
      const tag = document.createElement('em');
      tag.className = 'cop-tag' + (mode === 'live' ? ' cop-tag-live' : '');
      tag.textContent = mode === 'live' ? 'LIVE' : 'Scripted';
      d.appendChild(tag);
    }
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
      : 'Settled — kept as-is. Your call, your bar.', 'scripted');
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
    r.log.forEach(l => say(l.bat, l.line, 'scripted'));
    say('Volt', 'Scripted safety net — hook verdict on the scripted bar: ' + r.hookVerdict + '.', 'scripted');
    checkSpats();
  }
  const scriptedBtn = $('live-scripted');
  if (scriptedBtn) scriptedBtn.onclick = runScripted;

  /* ---------- Hum-to-beat: record yourself humming, it listens, makes a beat ---------- */
  var humBusy = false;
  function runHum() {
    if (!H) { say('Forte', 'Hum module is not loaded on this page.'); return; }
    if (humBusy) return; // one take at a time — a second tap mid-take is ignored
    humBusy = true;
    var humBtn = $('live-hum');
    if (humBtn) humBtn.disabled = true;
    var p0 = S.getPattern();
    var noteEl = $('live-hum-note');
    var setNote = function (t) { if (noteEl) noteEl.textContent = t; };
    say('Forte', 'Hum it — one bar, into the mic. Pitch detection runs on-device; nothing leaves this browser.');
    H.captureBar(p0.bpm,
      (step, midi) => {
        setNote(midi == null ? 'Mic: listening… step ' + (step + 1) : 'heard ' + L.noteName(midi) + ' (step ' + (step + 1) + ')');
      },
      observed => {
        humBusy = false;
        if (humBtn) humBtn.disabled = false;
        const lane = H.notesToMelodyLane(observed);
        setNote('Mic: done — ' + lane.notes.length + ' notes heard.');
        const p = S.getPattern();
        const styleEl = $('cop-style');
        if (!L.trackHits(p.kick)) {
          const f = L.buildFrame(styleEl ? styleEl.value : 'boombap');
          p.kick = f.kick; p.snare = f.snare; p.hat = f.hat; p.bpm = f.bpm;
        }
        lane.notes.forEach(n => { p.melody[n.step] = n.midi; });
        p.bass = L.rideBassline(p);
        S.setPattern(p);
        const humLocal = 'Your hum, cleaned up to the scale — ' + lane.notes.length + ' notes on the grid. ' +
          'Volt framed it, Bass rode under it, vocal space is still open. (Rough hums snap to the nearest scale note — that cleanup is the charm.)';
        // One live call per hum, only in live mode: Forte reacts to the
        // hum through Spark. Otherwise the scripted line, tagged as such.
        if (liveMode() && !liveBusy) {
          liveBusy = true;
          DV.thinkLive('Forte',
            'You are Forte, the artists\' guide in the V Team (Verified Beats Studio). ' +
            'The producer just hummed a melody: ' + lane.notes.length + ' notes at ' + p.bpm + ' BPM, snapped to the scale. ' +
            'In one or two short sentences, react to the hum and say what to do next.',
            humLocal).then(r => {
              liveBusy = false;
              refreshCrewBadge();
              if (r.mode === 'live') say('Forte', r.line, 'live');
              else say('Forte', humLocal + ' (Live call failed' + (r.error ? ': ' + r.error : '') + ' — scripted line instead.)', 'scripted');
            });
        } else {
          say('Forte', humLocal, 'scripted');
        }
        const t = L.fiveSecondTest(p);
        say('Gwei', 'Hook test on your hum: ' + t.verdict + ' — ' + t.reasons[0] + '.', 'scripted');
        checkSpats();
      },
      err => {
        humBusy = false;
        if (humBtn) humBtn.disabled = false;
        if (err && err.code === 'mic-suspended') {
          // Retryable, not a failure of the demo: do NOT fall back to the
          // scripted run here, or the user thinks the mic worked.
          setNote('Mic suspended — tap to retry.');
          say('Forte', 'Mic suspended — the browser paused the microphone before it could listen. Tap the hum button again; if it keeps happening, check the mic permission in the lock icon in the address bar.');
          return;
        }
        setNote('Mic unavailable — running the scripted run instead.');
        say('Forte', 'Mic unavailable (' + (err && err.message ? err.message : 'no permission') + ') — falling back to the scripted run so the demo never dies.');
        runScripted();
      },
      {
        countInMs: 1200,
        onState: function (state) {
          if (state === 'requesting') setNote('Mic: asking for permission…');
          else if (state === 'count-in') setNote('Get ready… hum when the bar starts.');
          else if (state === 'listening') setNote('Mic: listening…');
          else if (state === 'suspended') setNote('Mic suspended — tap to retry.');
        },
      });
  }
  const humBtn = $('live-hum');
  if (humBtn) humBtn.onclick = runHum;

  /* ---------- Forte loop: theme in, suggestion out ----------
     Live mode: one short Spark call per tap (bat role + theme + current
     pattern state, one or two sentences back). Otherwise the scripted
     cue line, tagged Scripted — and on a live failure the scripted
     line is shown with the failure named, never silently swapped. */
  const forteGo = $('live-forte-go');
  if (forteGo) forteGo.onclick = async () => {
    const theme = ($('live-forte-theme') ? $('live-forte-theme').value : '').trim();
    if (!theme) {
      say('Forte', 'Write the theme first — in my home, before the session. That is the loop: what you write there is what I bring in here.', 'scripted');
      return;
    }
    const low = theme.toLowerCase();
    const cues = [];
    if (/anthem|hackathon|event|crowd/.test(low)) cues.push('anthem energy — something a crowd can chant');
    if (/night|3 ?am|alone|late/.test(low)) cues.push('late-night, alone-in-the-room feeling');
    if (/own|receipt|property|mine/.test(low)) cues.push('ownership — the payoff is the property itself');
    if (/love/.test(low)) cues.push('love-song warmth');
    const localLine = 'Noted from my home — your theme: "' + theme + '". ' +
      (cues.length ? 'So in this session I will lean toward ' + cues.join('; ') + '.' : 'I will carry that theme into the session.') +
      ' Write it there, hear it here — that is the loop, live.';
    if (!liveMode() || liveBusy) {
      say('Forte', localLine, 'scripted');
      return;
    }
    liveBusy = true;
    forteGo.disabled = true;
    const oldLabel = forteGo.textContent;
    forteGo.textContent = 'Asking Spark…';
    try {
      const p = S.getPattern();
      const r = await DV.thinkLive('Forte',
        'You are Forte, the artists\' guide in the V Team (Verified Beats Studio). ' +
        'The producer\'s theme is: "' + theme + '". Current pattern: ' + p.bpm + ' BPM, ' +
        'kick ' + L.trackHits(p.kick) + ' hits, snare ' + L.trackHits(p.snare) + ', hats ' + L.trackHits(p.hat) + '. ' +
        'In one or two short sentences, suggest how the theme should shape this session.',
        localLine);
      if (r.mode === 'live') say('Forte', r.line, 'live');
      else say('Forte', localLine + ' (Live call failed' + (r.error ? ': ' + r.error : '') + ' — scripted line instead.)', 'scripted');
    } finally {
      liveBusy = false;
      forteGo.disabled = false;
      forteGo.textContent = oldLabel;
      refreshCrewBadge();
    }
  };

  /* ---------- Voice direction: say it, Transcribe hears it ----------
     Records a short vocal take (5s max), sends the file to Transcribe,
     shows the transcript, then runs it through the SAME typed
     describe-a-beat path (fills #cop-desc and taps "Build it") — one
     parser, no duplicate build logic. File form only; realtime
     WebSocket transcription is out of scope. No key, failure, or
     timeout → say so and the typed notepad keeps working. */
  var voiceBusy = false;
  const voiceBtn = $('cop-desc-voice');
  if (voiceBtn) voiceBtn.onclick = async () => {
    if (voiceBusy) return;
    if (!DV || !DV.transcribeAudioFile) { say('Volt', 'Voice direction is not loaded on this page.', 'scripted'); return; }
    if (!DV.hasLocalKey()) { say('Volt', 'Voice direction needs your Meta API key saved in this browser first (Meta API card below) — the typed notepad still works.', 'scripted'); return; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined') {
      say('Volt', 'This browser cannot record audio here — type the direction instead.', 'scripted');
      return;
    }
    voiceBusy = true;
    voiceBtn.disabled = true;
    voiceBtn.textContent = '🎙 Listening… (5s)';
    let stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks = [];
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
      const stopped = new Promise(res => { rec.onstop = res; });
      rec.start();
      setTimeout(() => { if (rec.state !== 'inactive') rec.stop(); }, 5000);
      await stopped;
      const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
      if (!blob.size) { say('Volt', 'Heard nothing in those 5 seconds — type the direction instead.', 'scripted'); return; }
      say('Volt', 'Take recorded — sending it to Transcribe…');
      const r = await DV.transcribeAudioFile(blob);
      if (r.mode !== 'live' || !r.text) {
        say('Volt', 'Transcribe did not answer' + (r.error ? ' (' + r.error + ')' : '') + ' — type the direction instead, the notepad still works.', 'scripted');
        return;
      }
      say('Volt', 'You said: "' + r.text + '"', 'live');
      const desc = $('cop-desc');
      if (desc) desc.value = r.text;
      const go = $('cop-desc-go');
      if (go) go.click(); // existing typed path: same parser, same build
    } catch (e) {
      say('Volt', 'Mic unavailable (' + (e && e.message ? e.message : 'no permission') + ') — type the direction instead.', 'scripted');
    } finally {
      if (stream) stream.getTracks().forEach(t => t.stop());
      voiceBusy = false;
      voiceBtn.disabled = false;
      voiceBtn.textContent = '🎙 Say it';
      refreshCrewBadge();
    }
  };

  window.LiveAdapter = { checkSpats, runHum, runScripted, liveMode, refreshCrewBadge };
})();
