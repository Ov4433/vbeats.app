/* Headless tests for the studio pattern-draft autosave.
   Run: node test-draft-autosave.cjs
   Covers: PatternLogic.serializePattern/parsePattern round-trips and
   validation, and the StudioSeq onChange choke point (cell toggle, Clear,
   BPM input, setPattern) driven through a minimal DOM stub. */
const assert = require('node:assert');
const L = require('./web/js/pattern-logic.js');

let passed = 0;
function ok(name, fn) { fn(); passed++; console.log('  ✓ ' + name); }

/* ---------- serialize / parse round-trip ---------- */
const frame = (style) => { const f = L.buildFrame(style); const p = L.emptyPattern(f.bpm); p.kick = f.kick; p.snare = f.snare; p.hat = f.hat; return p; };

ok('round-trip: a full pattern (frame + bass + melody) survives serialize -> parse intact', () => {
  const p = frame('trap');
  p.bass = L.rideBassline(p);
  p.melody = L.findSpace(p).melody;
  const back = L.parsePattern(L.serializePattern(p));
  assert.deepStrictEqual(back, p);
});

ok('round-trip: an empty pattern survives too (restore guard keys off countHits)', () => {
  const p = L.emptyPattern(95);
  const back = L.parsePattern(L.serializePattern(p));
  assert.deepStrictEqual(back, p);
  assert.strictEqual(L.countHits(back), 0);
});

ok('serialize returns a JSON string snapshot — later edits to the pattern do not leak in', () => {
  const p = frame('house');
  const s = L.serializePattern(p);
  assert.strictEqual(typeof s, 'string');
  p.kick[1] = 1; p.bpm = 61;
  const back = L.parsePattern(s);
  assert.strictEqual(back.kick[1], 0);
  assert.strictEqual(back.bpm, 124);
});

ok('parse accepts a plain object as well as a string', () => {
  const p = frame('boombap');
  assert.deepStrictEqual(L.parsePattern(JSON.parse(L.serializePattern(p))), p);
});

/* ---------- parse validation: a stored draft is untrusted input ---------- */
ok('parse: garbage in -> null out (never throws)', () => {
  [null, undefined, '', 'not json', '{', '[]', '42', '"x"', {}, { bpm: 95 }].forEach(v =>
    assert.strictEqual(L.parsePattern(v), null, 'expected null for ' + JSON.stringify(v)));
});

ok('parse: wrong-length rows are rejected', () => {
  const p = frame('trap');
  const bad = JSON.parse(L.serializePattern(p));
  bad.hat = bad.hat.slice(0, 8);
  assert.strictEqual(L.parsePattern(bad), null);
  const bad2 = JSON.parse(L.serializePattern(p));
  bad2.melody = 'nope';
  assert.strictEqual(L.parsePattern(bad2), null);
});

ok('parse: bpm outside 40..240 is rejected', () => {
  const p = frame('trap');
  [10, 39, 241, 999, 'fast', NaN].forEach(b => {
    const bad = JSON.parse(L.serializePattern(p));
    bad.bpm = b;
    assert.strictEqual(L.parsePattern(bad), null, 'expected null for bpm ' + b);
  });
});

ok('parse: drum cells coerce to 0/1, note cells keep numbers and null out junk', () => {
  const p = L.emptyPattern(100);
  p.kick = [true, 'x', 2, 0, '', null, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  p.melody = [57, '60', 'abc', undefined, null, 0, 45.5, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const back = L.parsePattern(L.serializePattern(p));
  assert.deepStrictEqual(back.kick.slice(0, 7), [1, 1, 1, 0, 0, 0, 1]);
  assert.deepStrictEqual(back.melody.slice(0, 7), [57, 60, null, null, null, 0, 45.5]);
});

ok('parse: unknown extra fields are dropped, exactly the pattern keys come back', () => {
  const p = frame('drill');
  const withExtra = JSON.parse(L.serializePattern(p));
  withExtra.evil = '<script>'; withExtra.style = 'trap';
  const back = L.parsePattern(withExtra);
  assert.deepStrictEqual(Object.keys(back).sort(), ['bass', 'bpm', 'hat', 'kick', 'melody', 'snare']);
  assert.deepStrictEqual(back, p);
});

/* ---------- StudioSeq onChange choke point (minimal DOM stub) ---------- */
function stubEl() {
  return {
    children: [], className: '', textContent: '', value: '', style: {}, dataset: {},
    classList: { add() {}, remove() {}, toggle() {} },
    setAttribute() {}, appendChild(c) { this.children.push(c); },
    querySelectorAll() { return []; },
    _listeners: {}, addEventListener(t, fn) { this._listeners[t] = fn; },
    onclick: null,
  };
}
const els = {};
const docStub = {
  getElementById(id) { return els[id] || (els[id] = stubEl()); },
  createElement() { return stubEl(); },
};
global.window = { PatternLogic: L };
global.document = docStub;
require('./web/js/sequencer.js');
const S = global.window.StudioSeq;
assert.ok(S, 'StudioSeq exposed');
const grid = els['seq-grid'];
const cellsFor = row => grid.children.filter(c => c.dataset && c.dataset.row === row);

const saved = [];
S.setOnChange(p => saved.push(L.serializePattern(p)));

ok('hook: a cell toggle fires onChange with the edited pattern', () => {
  saved.length = 0;
  const kick0 = cellsFor('kick').find(c => +c.dataset.step === 0);
  kick0.onclick();
  assert.strictEqual(saved.length, 1);
  assert.strictEqual(L.parsePattern(saved[0]).kick[0], 1);
  const mel3 = cellsFor('melody').find(c => +c.dataset.step === 3);
  mel3.onclick();
  assert.strictEqual(saved.length, 2);
  assert.strictEqual(L.parsePattern(saved[1]).melody[3], 69, 'melody toggle uses the row note');
});

ok('hook: setPattern (every co-producer action) fires onChange', () => {
  saved.length = 0;
  const p = frame('boombap');
  S.setPattern(p);
  assert.strictEqual(saved.length, 1);
  assert.deepStrictEqual(L.parsePattern(saved[0]), p);
  assert.strictEqual(els['seq-bpm'].value, 90, 'bpm input follows setPattern');
});

ok('hook: the BPM input fires onChange with the new bpm (and ignores out-of-range)', () => {
  saved.length = 0;
  els['seq-bpm']._listeners.input({ target: { value: '128' } });
  assert.strictEqual(saved.length, 1);
  assert.strictEqual(L.parsePattern(saved[0]).bpm, 128);
  els['seq-bpm']._listeners.input({ target: { value: '999' } });
  assert.strictEqual(saved.length, 1, 'out-of-range bpm is not a mutation');
});

ok('hook: Clear fires onChange with an empty pattern at the same bpm', () => {
  saved.length = 0;
  els['seq-clear'].onclick();
  assert.strictEqual(saved.length, 1);
  const back = L.parsePattern(saved[0]);
  assert.strictEqual(L.countHits(back), 0);
  assert.strictEqual(back.bpm, 128);
});

ok('hook: a throwing onChange never breaks the grid', () => {
  S.setOnChange(() => { throw new Error('storage exploded'); });
  const kick1 = cellsFor('kick').find(c => +c.dataset.step === 1);
  kick1.onclick(); // must not throw
  assert.strictEqual(S.getPattern().kick[1], 1);
  S.setOnChange(null);
});

console.log('\n' + passed + ' tests passed.');
