/**
 * test-vote-weight.cjs — offline tests for voteService weight + week logic.
 *
 * Run from backend/:  node test-vote-weight.cjs
 *
 * Makes NO live chain calls and NO database calls:
 *  - decideWeight is tested as a pure function.
 *  - weekWindowUtc is tested as a pure function.
 *  - computeVoteWeight is tested with stubbed chain readers, both via its
 *    injectable `readers` parameter and via monkeypatching the passService
 *    module exports (the transpiled service reads getPassState /
 *    checkHolding off the module object at call time, so patching works).
 */
'use strict';

require('ts-node').register({ transpileOnly: true });

const assert = require('assert');

async function main() {
  let passed = 0;
  const ok = (name) => {
    passed += 1;
    console.log(`  ok - ${name}`);
  };

  // Patch passService BEFORE exercising computeVoteWeight without injected
  // readers, so no real RPC is ever attempted by the monkeypatch cases.
  const passService = require('./src/services/passService.ts');
  const originalGetPassState = passService.getPassState;
  const originalCheckHolding = passService.checkHolding;

  const voteService = require('./src/services/voteService.ts');
  const { decideWeight, computeVoteWeight, weekWindowUtc } = voteService;
  assert.strictEqual(typeof decideWeight, 'function');
  assert.strictEqual(typeof computeVoteWeight, 'function');
  assert.strictEqual(typeof weekWindowUtc, 'function');

  // --- decideWeight: pure mappings -------------------------------------
  assert.strictEqual(decideWeight({ hasPass: true, eligible: true }), 3);
  ok('decideWeight: pass + eligible -> 3');
  assert.strictEqual(decideWeight({ hasPass: true, eligible: false }), 3);
  ok('decideWeight: pass only -> 3');
  assert.strictEqual(decideWeight({ hasPass: false, eligible: true }), 2);
  ok('decideWeight: eligible only -> 2');
  assert.strictEqual(decideWeight({ hasPass: false, eligible: false }), 1);
  ok('decideWeight: neither -> 1');

  // --- computeVoteWeight: no wallet -------------------------------------
  assert.strictEqual(await computeVoteWeight(null), 1);
  ok('computeVoteWeight: null wallet -> 1 (no chain call)');
  assert.strictEqual(await computeVoteWeight(''), 1);
  ok('computeVoteWeight: empty wallet -> 1');

  // --- computeVoteWeight: injected readers ------------------------------
  const WALLET = '0x0000000000000000000000000000000000000001';

  assert.strictEqual(
    await computeVoteWeight(WALLET, {
      getPassState: async () => ({ hasPass: true, tokenId: 7 }),
      checkHolding: async () => {
        throw new Error('must not be called when pass present');
      },
    }),
    3
  );
  ok('computeVoteWeight (injected): hasPass -> 3, holding not consulted');

  assert.strictEqual(
    await computeVoteWeight(WALLET, {
      getPassState: async () => ({ hasPass: false, tokenId: null }),
      checkHolding: async () => ({
        configured: true,
        balance: '10000000000000000000',
        balanceFormatted: '10',
        threshold: '10',
        eligible: true,
      }),
    }),
    2
  );
  ok('computeVoteWeight (injected): no pass + eligible -> 2');

  assert.strictEqual(
    await computeVoteWeight(WALLET, {
      getPassState: async () => ({ hasPass: false, tokenId: null }),
      checkHolding: async () => ({
        configured: true,
        balance: '0',
        balanceFormatted: '0',
        threshold: '10',
        eligible: false,
      }),
    }),
    1
  );
  ok('computeVoteWeight (injected): no pass + not eligible -> 1');

  // Failed pass read must still allow the holding check.
  assert.strictEqual(
    await computeVoteWeight(WALLET, {
      getPassState: async () => {
        throw new Error('RPC down (stub)');
      },
      checkHolding: async () => ({
        configured: true,
        balance: '10000000000000000000',
        balanceFormatted: '10',
        threshold: '10',
        eligible: true,
      }),
    }),
    2
  );
  ok('computeVoteWeight (injected): pass read throws -> holding check -> 2');

  // Total chain failure degrades to 1 and never throws.
  assert.strictEqual(
    await computeVoteWeight(WALLET, {
      getPassState: async () => {
        throw new Error('RPC down (stub)');
      },
      checkHolding: async () => {
        throw new Error('RPC down (stub)');
      },
    }),
    1
  );
  ok('computeVoteWeight (injected): both reads throw -> 1, never throws');

  // --- computeVoteWeight: monkeypatched passService module --------------
  passService.getPassState = async () => ({ hasPass: true, tokenId: 3 });
  passService.checkHolding = async () => {
    throw new Error('must not be called when pass present');
  };
  assert.strictEqual(await computeVoteWeight(WALLET), 3);
  ok('computeVoteWeight (monkeypatched module): hasPass -> 3');

  passService.getPassState = async () => ({ hasPass: false, tokenId: null });
  passService.checkHolding = async () => ({
    configured: true,
    balance: '10000000000000000000',
    balanceFormatted: '10',
    threshold: '10',
    eligible: true,
  });
  assert.strictEqual(await computeVoteWeight(WALLET), 2);
  ok('computeVoteWeight (monkeypatched module): eligible -> 2');

  passService.getPassState = originalGetPassState;
  passService.checkHolding = originalCheckHolding;

  // --- weekWindowUtc ------------------------------------------------------
  // Week of Wed 2026-10-21: Mon 2026-10-19 00:00 UTC .. Mon 2026-10-26.
  const expectedStart = Date.UTC(2026, 9, 19, 0, 0, 0, 0);
  const expectedEnd = expectedStart + 7 * 24 * 60 * 60 * 1000;

  const wed = weekWindowUtc(new Date('2026-10-21T16:57:17.000Z'));
  assert.strictEqual(wed.start.getTime(), expectedStart);
  assert.strictEqual(wed.end.getTime(), expectedEnd);
  assert.strictEqual(wed.start.getUTCDay(), 1); // Monday
  assert.strictEqual(
    wed.start.getUTCHours() +
      wed.start.getUTCMinutes() +
      wed.start.getUTCSeconds() +
      wed.start.getUTCMilliseconds(),
    0
  );
  ok('weekWindowUtc: Wednesday -> Monday 00:00 UTC start, +7d end');

  const sun = weekWindowUtc(new Date('2026-10-25T23:59:59.999Z'));
  assert.strictEqual(sun.start.getTime(), expectedStart);
  assert.strictEqual(sun.end.getTime(), expectedEnd);
  ok('weekWindowUtc: Sunday (same week) -> same Monday start');

  const mon = weekWindowUtc(new Date('2026-10-19T00:00:00.000Z'));
  assert.strictEqual(mon.start.getTime(), expectedStart);
  assert.strictEqual(mon.end.getTime(), expectedEnd);
  ok('weekWindowUtc: Monday 00:00 exactly -> itself as start');

  const nextMon = weekWindowUtc(new Date('2026-10-26T00:00:00.000Z'));
  assert.strictEqual(nextMon.start.getTime(), expectedEnd);
  ok('weekWindowUtc: following Monday -> next week window');

  assert.strictEqual(wed.end.getTime() - wed.start.getTime(), 7 * 24 * 60 * 60 * 1000);
  ok('weekWindowUtc: end - start is exactly 7 days');

  console.log(`\ntest-vote-weight: ${passed} checks passed`);
}

main().catch((err) => {
  console.error('test-vote-weight: FAILED');
  console.error(err);
  process.exit(1);
});
