/* Headless tests for the V Team co-producer pattern logic.
   Run: node test-coproducer.cjs */
const assert = require('node:assert');
const L = require('./web/js/pattern-logic.js');

let passed = 0;
function ok(name, fn) { fn(); passed++; console.log('  ✓ ' + name); }

const frame = (style) => { const f = L.buildFrame(style); const p = L.emptyPattern(f.bpm); p.kick = f.kick; p.snare = f.snare; p.hat = f.hat; return p; };

ok('empty pattern shape', () => {
  const p = L.emptyPattern(95);
  ['kick', 'snare', 'hat', 'bass', 'melody'].forEach(k => assert.strictEqual(p[k].length, 16));
  assert.strictEqual(L.countHits(p), 0);
});

ok('frames: boombap 90 / snare 4+12', () => {
  const f = L.buildFrame('boombap');
  assert.strictEqual(f.bpm, 90);
  assert.deepStrictEqual(f.snare.map((v, i) => v ? i : -1).filter(i => i >= 0), [4, 12]);
  assert.strictEqual(f.kick[0], 1);
});
ok('frames: trap 140 / half-time snare on 8 only', () => {
  const f = L.buildFrame('trap');
  assert.strictEqual(f.bpm, 140);
  assert.strictEqual(L.trackHits(f.snare), 1); assert.strictEqual(f.snare[8], 1);
  assert.ok(L.trackHits(f.hat) >= 10);
});
ok('frames: house 124 / four on the floor', () => {
  const f = L.buildFrame('house');
  assert.strictEqual(f.bpm, 124);
  [0, 4, 8, 12].forEach(i => assert.strictEqual(f.kick[i], 1));
});
ok('frames: unknown style falls back to boombap', () => {
  assert.strictEqual(L.buildFrame('nope').bpm, 90);
});

ok('bassline rides the kick (root on every kick, extras only as pickups)', () => {
  const p = frame('boombap');
  p.bass = L.rideBassline(p);
  p.kick.forEach((v, i) => { if (v) assert.strictEqual(p.bass[i], L.BASS_ROOT, 'kick step ' + i); });
  p.bass.forEach((n, i) => {
    if (n == null) return;
    const onKick = p.kick[i] === 1;
    const pickup = i >= 2 && p.kick[i - 2] === 1;   // fifth/octave pickup sits 2 steps after a kick
    assert.ok(onKick || pickup, 'bass note at ' + i + ' is neither on a kick nor a pickup');
    assert.ok(L.MINOR.includes(((n - L.BASS_ROOT) % 12 + 12) % 12), 'note in minor scale');
  });
  assert.ok(L.trackHits(p.bass) > L.trackHits(p.kick), 'pickups were added');
});
ok('bassline on empty pattern stays empty', () => {
  assert.strictEqual(L.trackHits(L.rideBassline(L.emptyPattern())), 0);
});

ok('findSpace: sparse melody, no snare collisions, vocal gap named', () => {
  const p = frame('boombap'); p.bass = L.rideBassline(p);
  const r = L.findSpace(p);
  assert.ok(r.noteCount >= 1 && r.noteCount <= 4, 'noteCount=' + r.noteCount);
  const idx = r.melody.map((v, i) => v != null ? i : -1).filter(i => i >= 0);
  idx.forEach(i => assert.strictEqual(p.snare[i], 0, 'melody over snare at ' + i));
  for (let k = 1; k < idx.length; k++) assert.ok(idx[k] - idx[k - 1] >= 2, 'phrases spaced');
  const half = idx[0] < 8 ? 0 : 8;
  idx.forEach(i => assert.ok(i >= half && i < half + 8, 'melody confined to one half'));
  assert.strictEqual(r.vocalLen, 8, 'vocal gets a full clear half');
  for (let i = r.vocalFrom; i <= r.vocalTo; i++) assert.strictEqual(r.melody[i], null);
});

ok('5-second test: empty pattern -> too empty', () => {
  assert.strictEqual(L.fiveSecondTest(L.emptyPattern()).verdict, 'empty');
});
ok('5-second test: boombap frame + bass -> hook lands', () => {
  const p = frame('boombap'); p.bass = L.rideBassline(p);
  const r = L.fiveSecondTest(p);
  assert.strictEqual(r.verdict, 'lands', JSON.stringify(r));
});
ok('5-second test: saturated grid -> too busy', () => {
  const p = L.emptyPattern(120);
  ['kick', 'snare', 'hat'].forEach(k => p[k].fill(1));
  p.bass.fill(33); p.melody.fill(57);
  assert.strictEqual(L.fiveSecondTest(p).verdict, 'busy');
});
ok('5-second test: hits but no kick on step 1 -> no anchor', () => {
  const p = L.emptyPattern(100);
  p.snare = p.snare.map((_, i) => (i === 4 || i === 12) ? 1 : 0);
  p.hat = p.hat.map((_, i) => i % 2 === 0 ? 1 : 0);
  assert.strictEqual(L.fiveSecondTest(p).verdict, 'no-anchor');
});

ok('stripBack: drums kept, hats to quarters, melody to one accent', () => {
  const p = frame('trap'); p.bass = L.rideBassline(p);
  p.melody = L.findSpace(p).melody;
  const before = L.clone(p);
  const r = L.stripBack(p);
  assert.deepStrictEqual(r.pattern.kick, before.kick);
  assert.deepStrictEqual(r.pattern.snare, before.snare);
  r.pattern.hat.forEach((v, i) => { if (v) assert.strictEqual(i % 4, 0, 'hat off quarter at ' + i); });
  assert.ok(L.trackHits(r.pattern.melody) <= 1);
  assert.ok(r.removed > 0, 'removed=' + r.removed);
  assert.strictEqual(L.countHits(p) - L.countHits(r.pattern), r.removed);
});
ok('stripBack: already-minimal pattern removes nothing', () => {
  const p = L.emptyPattern(90); p.kick[0] = 1; p.snare[4] = 1;
  assert.strictEqual(L.stripBack(p).removed, 0);
});

console.log('\n' + passed + ' tests passed.');
