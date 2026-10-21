/**
 * test-daily-lines.cjs — offline tests for DailyLines (web/js/daily-lines.js).
 *
 * Run from repo root:  node test-daily-lines.cjs
 */
'use strict';

const assert = require('assert');
const DailyLines = require('./web/js/daily-lines.js');
const { LINES, dayNumber, dailyLine } = DailyLines;

let passed = 0;
const ok = (name) => { passed += 1; console.log(`  ok - ${name}`); };

// --- bank shape ------------------------------------------------------------
assert.strictEqual(LINES.length, 16);
ok('bank holds exactly 16 lines');
for (const bat of ['volt', 'forte', 'bass', 'gwei']) {
  assert.strictEqual(LINES.filter(l => l.bat === bat).length, 4, bat);
}
ok('exactly 4 lines per bat');
// Interleaved: consecutive entries are never the same bat.
for (let i = 1; i < LINES.length; i++) assert.notStrictEqual(LINES[i].bat, LINES[i - 1].bat);
ok('bank interleaves bats (no back-to-back repeats)');
for (const l of LINES) {
  assert.ok(l.text.length > 10 && l.text.length < 140, 'line is short');
  assert.ok(!/rubin/i.test(l.text), 'no outside names');
}
ok('all lines are short and clean');

// --- determinism ------------------------------------------------------------
const d = new Date(Date.UTC(2026, 9, 21)); // 2026-10-21
assert.deepStrictEqual(dailyLine(d), dailyLine(new Date(Date.UTC(2026, 9, 21, 23, 59))));
ok('same UTC day -> same line, any hour');
assert.strictEqual(dayNumber(new Date(Date.UTC(1970, 0, 1))), 0);
ok('dayNumber: epoch is day 0');
// A known date maps to a stable, recomputed index.
const expectIdx = ((dayNumber(d) % 16) + 16) % 16;
assert.strictEqual(dailyLine(d).index, expectIdx);
assert.strictEqual(dailyLine(d).bat, LINES[expectIdx].bat);
ok('dailyLine index matches the day-number rotation');

// --- rotation ---------------------------------------------------------------
const ORDER = ['volt', 'forte', 'bass', 'gwei'];
const bats = [];
for (let i = 0; i < 8; i++) {
  bats.push(dailyLine(new Date(Date.UTC(2026, 0, 1 + i))).bat);
}
for (let i = 1; i < bats.length; i++) {
  const prev = ORDER.indexOf(bats[i - 1]);
  assert.strictEqual(bats[i], ORDER[(prev + 1) % 4], 'each day hands off to the next bat');
}
assert.deepStrictEqual(bats.slice(4), bats.slice(0, 4));
ok('rotation walks volt -> forte -> bass -> gwei cyclically and repeats every 4 days');
const sixteen = new Set();
for (let i = 0; i < 16; i++) sixteen.add(dailyLine(new Date(Date.UTC(2026, 2, 1 + i))).index);
assert.strictEqual(sixteen.size, 16);
ok('16 consecutive days cover all 16 lines exactly once');

console.log(`\ntest-daily-lines: ${passed} checks passed`);
