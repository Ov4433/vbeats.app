/* DemoHum — browser-side hum-to-beat pitch detection.
   Honest split (canonical spec §3): the speech transcription API hears
   words, not notes. Melody detection runs HERE, on-device, in the
   browser: microphone → autocorrelation pitch tracking → MIDI notes →
   snapped to the nearest scale and 16-step grid → the crew arranges
   around the detected notes (Volt frame, Bass bassline under it,
   Forte vocal space, Gwei hook test).
   No audio ever leaves the device for pitch detection. No Meta API key
   is involved in this module at all.
   UMD: pure math testable in node; mic capture is browser-only. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DemoHum = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const STEPS = 16;
  const MINOR_PENTA = [0, 3, 5, 7, 10];   // minor pentatonic, no semitone traps for rough hums
  const MELODY_ROOT = 57;                 // A3, same anchor as PatternLogic

  function freqToMidi(freq) {
    if (!freq || freq <= 0) return null;
    return Math.round(69 + 12 * Math.log2(freq / 440));
  }
  function midiToFreq(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }

  /* Snap a raw MIDI note to the nearest note of the scale above the root.
     Rough hums land between notes; the snap is the crew "cleaning up your
     hum" — part of the charm, and it is disclosed on screen, not hidden. */
  function snapToScale(midi, root, scale) {
    if (midi == null) return null;
    const r = root == null ? MELODY_ROOT : root;
    const sc = scale && scale.length ? scale : MINOR_PENTA;
    const rel = midi - r;
    const oct = Math.floor(rel / 12);
    let pc = ((rel % 12) + 12) % 12;
    let best = sc[0], bestD = 99;
    sc.forEach(iv => {
      const d = Math.abs(iv - pc);
      if (d < bestD) { bestD = d; best = iv; }
    });
    return r + oct * 12 + best;
  }

  /* Autocorrelation pitch estimate for one time-domain frame.
     Returns Hz or null (silence / no confident periodicity). Pure math
     over samples so the detector can be unit-tested without a mic. */
  function estimatePitch(samples, sampleRate) {
    if (!samples || samples.length < 2048) return null;
    let rms = 0;
    for (let i = 0; i < samples.length; i++) rms += samples[i] * samples[i];
    rms = Math.sqrt(rms / samples.length);
    if (rms < 0.01) return null;                       // silence, not a note
    const minLag = Math.floor(sampleRate / 600);       // ~600 Hz ceiling
    const maxLag = Math.floor(sampleRate / 60);        // ~60 Hz floor
    let bestLag = -1, bestCorr = 0;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let corr = 0;
      for (let i = 0; i < samples.length - lag; i++) corr += samples[i] * samples[i + lag];
      if (corr > bestCorr) { bestCorr = corr; bestLag = lag; }
    }
    if (bestLag < 0) return null;
    return sampleRate / bestLag;
  }

  /* Turn one bar of per-step raw MIDI observations (null = no confident
     pitch on that step) into a melody lane: snap each note to scale,
     then thin to at most 4 notes with breathing room, mirroring how
     Forte leaves vocal space. Returns { melody[16], notes: [{step, midi}] }. */
  function notesToMelodyLane(observed, root, scale) {
    const lane = Array(STEPS).fill(null);
    const notes = [];
    for (let i = 0; i < STEPS; i++) {
      if (notes.length >= 4) break;
      const raw = observed[i];
      if (raw == null) continue;
      if (notes.length && i - notes[notes.length - 1].step < 2) continue;
      const midi = snapToScale(raw, root, scale);
      notes.push({ step: i, midi });
      lane[i] = midi;
    }
    return { melody: lane, notes };
  }

  /* Browser capture: one bar of pitch observations at the given BPM.
     onDone(observed[16]) fires when the bar ends; onStep(step, midi|null)
     fires live so the page can draw the hum as it arrives. Any failure
     (no mic, denied permission) calls onError — the caller MUST fall
     back to the scripted safety net, never hang — EXCEPT a suspended
     AudioContext, which is retryable: that error carries
     code === 'mic-suspended' and the caller should show
     "Mic suspended — tap to retry" instead of silently running the
     scripted net, or the user thinks the mic worked when it didn't.
     opts: { countInMs (default 1200), onState(state) } — onState fires
     'requesting' | 'count-in' | 'listening' | 'suspended' | 'done' |
     'error' so the UI can show the real mic state. The count-in gives
     the user a beat to breathe before the one-bar window starts; the
     1-bar / max-4-notes limits are unchanged. */
  function captureBar(bpm, onStep, onDone, onError, opts) {
    opts = opts || {};
    var countInMs = typeof opts.countInMs === 'number' ? opts.countInMs : 1200;
    var onState = typeof opts.onState === 'function' ? opts.onState : function () {};
    var fail = function (err) {
      onState(err && err.code === 'mic-suspended' ? 'suspended' : 'error');
      if (onError) onError(err);
    };
    if (typeof navigator === 'undefined' || !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia || typeof AudioContext === 'undefined') {
      fail(new Error('Microphone or Web Audio unavailable in this browser'));
      return;
    }
    onState('requesting');
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      var actx = new AudioContext();
      var closed = false;
      var cleanup = function () {
        if (closed) return;
        closed = true;
        try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
        try { actx.close(); } catch (e) {}
      };
      // Phones suspend AudioContext created outside a user gesture (and
      // getUserMedia resolves outside the gesture too), so resume it
      // explicitly — twice if needed — and check the real state before
      // listening. Without this the analyser reads silence forever.
      var resume = function () {
        return actx.resume().catch(function () {}).then(function () {
          if (actx.state === 'suspended') return actx.resume().catch(function () {});
        });
      };
      resume().then(function () {
        if (actx.state !== 'running') {
          cleanup();
          var suspended = new Error('Microphone is suspended by the browser — tap the hum button again to retry');
          suspended.code = 'mic-suspended';
          fail(suspended);
          return;
        }
        var src = actx.createMediaStreamSource(stream);
        var analyser = actx.createAnalyser();
        analyser.fftSize = 2048;
        src.connect(analyser);
        var buf = new Float32Array(analyser.fftSize);
        var barMs = (60 / (bpm || 95)) * 4 * 1000;
        var stepMs = barMs / STEPS;
        var observed = Array(STEPS).fill(null);
        var startListening = function () {
          onState('listening');
          var started = performance.now();
          var tick = function () {
            // If the browser suspends us mid-bar, try once to resume;
            // if it stays suspended, stop cleanly instead of recording
            // a bar of silence and calling it a hum.
            if (actx.state === 'suspended') {
              actx.resume().catch(function () {});
              if (actx.state === 'suspended') {
                cleanup();
                var err = new Error('Microphone was suspended mid-take — tap the hum button again to retry');
                err.code = 'mic-suspended';
                fail(err);
                return;
              }
            }
            var elapsed = performance.now() - started;
            var step = Math.floor(elapsed / stepMs);
            if (step >= STEPS) {
              cleanup();
              onState('done');
              if (onDone) onDone(observed);
              return;
            }
            analyser.getFloatTimeDomainData(buf);
            var freq = estimatePitch(buf, actx.sampleRate);
            var midi = freqToMidi(freq);
            if (observed[step] == null) observed[step] = midi;
            if (onStep) onStep(step, midi);
            requestAnimationFrame(tick);
          };
          tick();
        };
        if (countInMs > 0) {
          onState('count-in');
          setTimeout(startListening, countInMs);
        } else {
          startListening();
        }
      });
    }).catch(fail);
  }

  return { STEPS, MINOR_PENTA, MELODY_ROOT, freqToMidi, midiToFreq,
    snapToScale, estimatePitch, notesToMelodyLane, captureBar };
});
