/**
 * test-solana-link.cjs — offline tests for the Solana wallet-link proof.
 *
 * Run from backend/:  node test-solana-link.cjs
 *
 * Generates a REAL ed25519 keypair (tweetnacl), signs the exact server
 * message the way Phantom's signMessage would, and checks the service:
 * accepts the honest signature, rejects tampered / cross-account /
 * malformed ones. Address-availability is tested with a stub finder —
 * no database, no network.
 */
'use strict';

require('ts-node').register({ transpileOnly: true });

const assert = require('assert');
const nacl = require('tweetnacl');
const bs58mod = require('bs58');
const bs58 = bs58mod.default || bs58mod;

const {
  buildLinkMessage,
  verifyLinkSignature,
  assertAddressAvailable,
} = require('./src/services/solanaService.ts');

let passed = 0;
const ok = (name) => { passed += 1; console.log(`  ok - ${name}`); };

function signFor(userId, keyPair) {
  const message = buildLinkMessage(userId);
  const sig = nacl.sign.detached(new TextEncoder().encode(message), keyPair.secretKey);
  return {
    address: bs58.encode(keyPair.publicKey),
    signature: bs58.encode(sig),
    message,
  };
}

async function main() {
  assert.strictEqual(typeof buildLinkMessage, 'function');
  assert.strictEqual(typeof verifyLinkSignature, 'function');
  assert.strictEqual(typeof assertAddressAvailable, 'function');

  const kp = nacl.sign.keyPair();
  const USER = 'ckuser000000000000000001';
  const OTHER = 'ckuser000000000000000002';

  // --- message format ------------------------------------------------------
  assert.strictEqual(
    buildLinkMessage(USER),
    `Link this Solana wallet to VBeats account ${USER}`
  );
  ok('buildLinkMessage: exact server-specified format');

  // --- honest signature ----------------------------------------------------
  const good = signFor(USER, kp);
  assert.strictEqual(verifyLinkSignature(USER, good), true);
  ok('accepts a real signature over the exact message');

  // --- tampered signature --------------------------------------------------
  const sigBytes = bs58.decode(good.signature);
  sigBytes[10] ^= 0xff;
  assert.strictEqual(
    verifyLinkSignature(USER, { ...good, signature: bs58.encode(sigBytes) }),
    false
  );
  ok('rejects a tampered signature');

  // --- cross-account replay -------------------------------------------------
  assert.strictEqual(verifyLinkSignature(OTHER, good), false);
  ok('rejects replaying the signature against a different account');

  // --- wrong message body ----------------------------------------------------
  assert.strictEqual(
    verifyLinkSignature(USER, { ...good, message: good.message + ' ' }),
    false
  );
  ok('rejects a signature whose message differs by even one character');

  // --- a different wallet's signature for this address ----------------------
  const kp2 = nacl.sign.keyPair();
  const foreign = signFor(USER, kp2);
  assert.strictEqual(
    verifyLinkSignature(USER, { ...foreign, address: good.address }),
    false
  );
  ok('rejects a signature from a different key than the address claims');

  // --- malformed inputs ------------------------------------------------------
  assert.strictEqual(verifyLinkSignature(USER, { address: 'not-base58!!', signature: good.signature, message: good.message }), false);
  assert.strictEqual(verifyLinkSignature(USER, { address: good.address, signature: 'abc', message: good.message }), false);
  assert.strictEqual(verifyLinkSignature(USER, { address: '', signature: '', message: '' }), false);
  assert.strictEqual(verifyLinkSignature(USER, null), false);
  assert.strictEqual(verifyLinkSignature(USER, undefined), false);
  ok('rejects malformed address / signature / empty / missing input');

  // --- address availability (stub finder) ------------------------------------
  const addr = good.address;
  const nobody = async () => null;
  const mine = async () => ({ id: USER });
  const theirs = async () => ({ id: OTHER });
  assert.strictEqual(await assertAddressAvailable(addr, USER, nobody), true);
  ok('availability: unlinked address is available');
  assert.strictEqual(await assertAddressAvailable(addr, USER, mine), true);
  ok('availability: re-linking to the same account is allowed');
  assert.strictEqual(await assertAddressAvailable(addr, USER, theirs), false);
  ok('availability: address linked to another account is rejected');

  console.log(`\ntest-solana-link: ${passed} checks passed`);
}

main().catch((e) => { console.error(e); process.exit(1); });
