/* Headless tests for publish-from-the-sequencer + describe-a-beat logic.
   Run: node test-pattern-publish.cjs */
const assert = require('node:assert');
const L = require('./web/js/pattern-logic.js');

let passed = 0;
function ok(name, fn) { fn(); passed++; console.log('  ✓ ' + name); }

/* ---------- parseDescribe ---------- */
ok('describe: "dark boom bap, 92, sparse" parses fully, nothing ignored', () => {
  const d = L.parseDescribe('dark boom bap, 92, sparse');
  assert.deepStrictEqual(d, { style: 'boombap', bpm: 92, density: 'sparse', mood: 'dark', ignored: [] });
});
ok('describe: "trap at 140, busy" — filler word "at" is not reported', () => {
  const d = L.parseDescribe('trap at 140, busy');
  assert.deepStrictEqual(d, { style: 'trap', bpm: 140, density: 'busy', mood: null, ignored: [] });
});
ok('describe: "house" — style only, everything else null', () => {
  const d = L.parseDescribe('house');
  assert.deepStrictEqual(d, { style: 'house', bpm: null, density: null, mood: null, ignored: [] });
});
ok('describe: "drill, bright and full" — full maps to busy, bright to mood', () => {
  const d = L.parseDescribe('drill, bright and full');
  assert.deepStrictEqual(d, { style: 'drill', bpm: null, density: 'busy', mood: 'bright', ignored: [] });
});
ok('describe: "boom-bap 88 minimal" — hyphenated style, minimal maps to sparse', () => {
  const d = L.parseDescribe('boom-bap 88 minimal');
  assert.deepStrictEqual(d, { style: 'boombap', bpm: 88, density: 'sparse', mood: null, ignored: [] });
});
ok('describe: "midnight run 999" — nothing buildable, unknowns + bad number reported', () => {
  const d = L.parseDescribe('midnight run 999');
  assert.strictEqual(d.style, null); assert.strictEqual(d.bpm, null);
  assert.strictEqual(d.density, null); assert.strictEqual(d.mood, null);
  ['midnight', 'run', '999'].forEach(w => assert.ok(d.ignored.includes(w), 'ignored has ' + w));
});
ok('describe: "please make a beat" — all stopwords, ignored stays empty', () => {
  const d = L.parseDescribe('please make a beat');
  assert.deepStrictEqual(d.ignored, []);
  assert.strictEqual(d.style, null);
});
ok('describe: "something at 92bpm" — bpm suffix glued to the number still parses', () => {
  const d = L.parseDescribe('something at 92bpm');
  assert.strictEqual(d.bpm, 92);
  assert.deepStrictEqual(d.ignored, ['something']);
});
ok('describe: empty text -> all null, no ignored', () => {
  assert.deepStrictEqual(L.parseDescribe(''), { style: null, bpm: null, density: null, mood: null, ignored: [] });
});

/* ---------- adjustDensity ---------- */
const frame = (style) => { const f = L.buildFrame(style); const p = L.emptyPattern(f.bpm); p.kick = f.kick; p.snare = f.snare; p.hat = f.hat; return p; };
ok('density sparse: boombap hats survive only on the quarters, input not mutated', () => {
  const p = frame('boombap');
  const before = p.hat.slice();
  const out = L.adjustDensity(p, 'sparse');
  out.hat.forEach((v, i) => { if (v) assert.strictEqual(i % 4, 0, 'hat off quarter at ' + i); });
  assert.strictEqual(L.trackHits(out.hat), 4);
  assert.deepStrictEqual(p.hat, before, 'original pattern untouched');
});
ok('density busy: empty grid gains 8th-note hats + roll-tail steps 13 and 15', () => {
  const out = L.adjustDensity(L.emptyPattern(120), 'busy');
  const idx = out.hat.map((v, i) => v ? i : -1).filter(i => i >= 0);
  assert.deepStrictEqual(idx, [0, 2, 4, 6, 8, 10, 12, 13, 14, 15]);
});
ok('density null: pattern passes through unchanged', () => {
  const p = frame('trap');
  const out = L.adjustDensity(p, null);
  assert.deepStrictEqual(out.hat, p.hat);
});

/* ---------- mood: findSpace with mood roots/scales ---------- */
const inScale = (notes, root, scale) => notes.filter(n => n != null)
  .every(n => scale.includes(((n - root) % 12 + 12) % 12));
ok('mood dark: melody notes sit in natural minor around the lowered root', () => {
  const p = frame('boombap'); p.bass = L.rideBassline(p);
  const root = L.MELODY_ROOT - 4;
  const r = L.findSpace(p, root, L.MINOR);
  assert.ok(r.noteCount >= 1, 'dark melody has notes');
  assert.ok(inScale(r.melody, root, L.MINOR), 'all notes in minor scale');
  r.melody.forEach(n => { if (n != null) assert.ok(n < L.MELODY_ROOT + 12, 'stays low'); });
});
ok('mood bright: melody notes sit in major pentatonic around the raised root', () => {
  const p = frame('boombap'); p.bass = L.rideBassline(p);
  const root = L.MELODY_ROOT + 3;
  const r = L.findSpace(p, root, L.MAJOR_PENTA);
  assert.ok(r.noteCount >= 1, 'bright melody has notes');
  assert.ok(inScale(r.melody, root, L.MAJOR_PENTA), 'all notes in major pentatonic');
});
ok('findSpace default (no scale arg) still uses minor pentatonic — regression', () => {
  const p = frame('boombap'); p.bass = L.rideBassline(p);
  const r = L.findSpace(p);
  assert.ok(inScale(r.melody, L.MELODY_ROOT, L.PENTA));
});

/* ---------- drill frame ---------- */
ok('drill frame: 142 bpm, snare only on step 8, kick opens the bar', () => {
  const f = L.buildFrame('drill');
  assert.strictEqual(f.style, 'drill'); assert.strictEqual(f.name, 'Drill');
  assert.strictEqual(f.bpm, 142);
  assert.strictEqual(f.kick[0], 1);
  assert.deepStrictEqual(f.snare.map((v, i) => v ? i : -1).filter(i => i >= 0), [8]);
});

/* ---------- duration / WAV math ---------- */
ok('duration math: a bar is 4 beats; pattern length scales with bars', () => {
  assert.strictEqual(L.barDurationSec(60), 4);
  assert.strictEqual(L.barDurationSec(240), 1);
  assert.strictEqual(L.patternDurationSec(120, 4), 8);
  assert.ok(Math.abs(L.patternDurationSec(90, 4) - 960 / 90) < 1e-9, 'four bars at 90 bpm');
});
ok('encodeWav mono: RIFF/WAVE header, sizes and sample rate are exact', () => {
  const sr = 44100, frames = 4410;
  const wav = L.encodeWav([new Float32Array(frames)], sr);
  const v = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  const magic = o => String.fromCharCode(wav[o], wav[o + 1], wav[o + 2], wav[o + 3]);
  assert.strictEqual(wav.length, 44 + frames * 2);
  assert.strictEqual(magic(0), 'RIFF'); assert.strictEqual(magic(8), 'WAVE');
  assert.strictEqual(magic(12), 'fmt '); assert.strictEqual(magic(36), 'data');
  assert.strictEqual(v.getUint32(4, true), 36 + frames * 2);
  assert.strictEqual(v.getUint16(20, true), 1, 'PCM');
  assert.strictEqual(v.getUint16(22, true), 1, 'mono');
  assert.strictEqual(v.getUint32(24, true), sr);
  assert.strictEqual(v.getUint32(40, true), frames * 2, 'data size');
});
ok('encodeWav stereo: interleaving, full-scale and clipping are exact', () => {
  const ch0 = new Float32Array([1, 0.5, 2]);    // 2.0 must clamp to full scale
  const ch1 = new Float32Array([-1, 0, -0.5]);
  const wav = L.encodeWav([ch0, ch1], 44100);
  const v = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  assert.strictEqual(wav.length, 44 + 3 * 2 * 2);
  assert.strictEqual(v.getUint16(22, true), 2, 'stereo');
  assert.strictEqual(v.getInt16(44, true), 32767, 'L frame0');
  assert.strictEqual(v.getInt16(46, true), -32768, 'R frame0');
  assert.strictEqual(v.getInt16(48, true), 16384, 'L frame1 (0.5)');
  assert.strictEqual(v.getInt16(52, true), 32767, 'L frame2 clamped');
  assert.strictEqual(v.getInt16(54, true), -16384, 'R frame2 (-0.5)');
});

console.log('\n' + passed + ' tests passed.');
