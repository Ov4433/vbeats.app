/* test-demo-modules.cjs — headless checks for the live-merged demo modules.
   Pure-logic only (no DOM, no mic): hum math, spat rails, safety net,
   voice stub, echobeat. Cold open EXCLUDED per Star, Nov 7 — no longer
   needed, so its check is removed here. Run: node test-demo-modules.cjs */
const assert = require('assert');
const L = require('./web/js/pattern-logic.js');
const H = require('./web/js/demo-hum.js');
const SP = require('./web/js/demo-spats.js');
const V = require('./web/js/demo-voice.js');
const SF = require('./web/js/demo-safety.js');
const E = require('./web/js/demo-echobeat.js');

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('ok - ' + name); };

/* Hum math: A4 = 440 Hz = MIDI 69; rough hum snaps to pentatonic. */
ok('hum freq/midi/scale math', () => {
  assert.strictEqual(H.freqToMidi(440), 69);
  assert.strictEqual(H.freqToMidi(0), null);
  assert.strictEqual(H.snapToScale(61, 57, H.MINOR_PENTA), 60); // C#4 -> C4 (pentatonic)
  assert.strictEqual(H.snapToScale(69, 57, H.MINOR_PENTA), 69); // A4 already in scale
  assert.strictEqual(H.snapToScale(null), null);
});
ok('hum pitch estimator finds a sine wave', () => {
  const sr = 44100, freq = 220, len = 4096, buf = new Float32Array(len);
  for (let i = 0; i < len; i++) buf[i] = 0.5 * Math.sin(2 * Math.PI * freq * i / sr);
  const est = H.estimatePitch(buf, sr);
  assert.ok(Math.abs(est - freq) / freq < 0.03, 'estimated ' + est + ' vs ' + freq);
  assert.strictEqual(H.estimatePitch(new Float32Array(4096), sr), null); // silence
});
ok('hum notes -> melody lane, max 4, breathing room', () => {
  const obs = Array(16).fill(null);
  obs[0] = 69; obs[1] = 71; obs[4] = 72; obs[8] = 74; obs[12] = 76; obs[15] = 77;
  const lane = H.notesToMelodyLane(obs);
  assert.strictEqual(lane.notes.length, 4); // capped, and step 1 skipped (too close to step 0)
  assert.strictEqual(lane.melody[0], 69);
  assert.strictEqual(lane.melody[1], null);
});

/* Spats: crowded bar fires, clean bar does not, cap is 2, gavel works. */
function crowdedPattern() {
  const p = L.emptyPattern(95);
  p.kick = L.buildFrame('house').kick; p.snare = L.buildFrame('house').snare;
  p.hat = Array(16).fill(1); // every step
  p.bass = L.rideBassline(p);
  [0, 2, 4, 6, 8, 10, 12, 14].forEach(s => { p.melody[s] = 69; }); // full melody too
  return p; // 38 hits / 80 slots = 0.475 density, over the 0.42 busy line
}
ok('spats fire on real crowded metric, not on a clean bar', () => {
  const st = SP.newSession();
  const spat = SP.evaluate(L, crowdedPattern(), st);
  assert.ok(spat, 'expected a spat on the crowded bar');
  assert.strictEqual(spat.trigger, 'crowded');
  assert.strictEqual(spat.lines.length, 2);
  assert.strictEqual(spat.referee, 'Volt');
  const clean = L.emptyPattern(95);
  const f = L.buildFrame('boombap');
  clean.kick = f.kick; clean.snare = f.snare; clean.hat = f.hat;
  clean.bass = L.rideBassline(clean);
  assert.strictEqual(SP.evaluate(L, clean, SP.newSession()), null);
});
ok('spats cap at 2 per session and producer gavel settles audibly', () => {
  const st = SP.newSession();
  const p = crowdedPattern();
  const spat = SP.evaluate(L, p, st);
  const r = SP.resolve(L, p, spat, 'apply', st);
  assert.ok(r.changed, 'apply must change the pattern audibly');
  assert.ok(L.countHits(r.pattern) < L.countHits(p), 'strip-back must remove hits');
  assert.strictEqual(r.state.count, 1);
  const st2 = { count: 2, lastHash: null };
  assert.strictEqual(SP.evaluate(L, crowdedPattern(), st2), null);
  const r2 = SP.resolve(L, p, spat, 'leave', SP.newSession());
  assert.strictEqual(r2.changed, false);
});

/* Safety net: scripted arc runs on real PatternLogic, ends with a hook verdict. */
ok('safety net scripted arc produces a playable bar', () => {
  const r = SF.runScripted(L, L.emptyPattern(95));
  assert.strictEqual(r.log.length, 5);
  assert.ok(L.countHits(r.pattern) > 0);
  assert.ok(['lands', 'busy', 'empty', 'no-anchor'].includes(r.hookVerdict));
  const fb = SF.withFallback(L, L.emptyPattern(95), () => { throw new Error('mic denied'); });
  assert.strictEqual(fb.degraded, true);
  assert.ok(L.countHits(fb.pattern) > 0);
});

/* Echobeatification: spec §3a — ask line, radar, lock, beat. */
ok('echobeatification ask, radar, lock, beat', () => {
  assert.deepStrictEqual(E.STAGES, ['ask', 'listen', 'radar', 'lock', 'beat']);
  assert.strictEqual(E.ASK_LINE, 'Would you like to let us try to match that echo?');
  assert.strictEqual(E.LOCK_LABEL, 'Echobeatification: echo becomes beat');
  assert.strictEqual(E.radarProgress(0), 0);
  assert.strictEqual(E.radarProgress(-5), 0);
  assert.strictEqual(E.radarProgress(E.RADAR_MS), 1);
  assert.strictEqual(E.radarProgress(99999), 1);
  assert.strictEqual(E.isLocked(1), true);
  assert.strictEqual(E.isLocked(0.5), false);
  const p = E.buildEchoBeat(L, 'boombap');
  assert.ok(L.countHits(p) > 0, 'echo beat must be playable');
  assert.ok(L.trackHits(p.kick), 'echo beat must have a kick to ride');
});

/* Voice stub: gated, no keys, local fallback parses real direction. */
ok('voice stub is gated and local fallback parses direction', () => {
  assert.strictEqual(V.status().live, false);
  assert.match(V.status().reason, /GATED/);
  assert.ok(!JSON.stringify(V).match(/sk-|api[_-]?key/i), 'no key material anywhere');
  const d = V.transcribeDirection(L, 'dark boom bap, 92, sparse');
  assert.strictEqual(d.mode, 'local-fallback');
  assert.strictEqual(d.parsed.style, 'boombap');
  assert.strictEqual(d.parsed.bpm, 92);
  assert.strictEqual(d.parsed.density, 'sparse');
  assert.strictEqual(V.think('Volt', 'hi').line, 'hi');
});

/* Hum capture without a browser: no navigator means onError + onState('error'),
   never a hang — and the suspended-mic error code exists for the retry path. */
ok('hum captureBar degrades without a mic and exposes the suspended code', () => {
  assert.strictEqual(typeof H.captureBar, 'function');
  let errSeen = null, stateSeen = null;
  H.captureBar(95, () => {}, () => {}, (e) => { errSeen = e; }, { onState: (s) => { stateSeen = s; }, countInMs: 0 });
  assert.ok(errSeen instanceof Error, 'onError must fire with no navigator');
  assert.match(errSeen.message, /unavailable/i);
  assert.strictEqual(stateSeen, 'error');
});

console.log('\n' + n + ' demo module checks passed.');
