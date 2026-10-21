#!/usr/bin/env node
'use strict';
/*
 * seed-house-beat.cjs — seed the VBeats "house beat" ("First Light").
 *
 * Standalone Node >= 18 script (CommonJS, NO new dependencies — only the
 * global fetch / FormData / Blob that ship with Node 18+).
 *
 * What it does:
 *   1. Builds the house pattern with the studio's own pure logic
 *      (web/js/pattern-logic.js): Volt's boom-bap frame at 90 BPM,
 *      Bass rides the kick, Forte finds the vocal space.
 *   2. Renders 4 bars of that pattern to a mono 44.1 kHz WAV, offline,
 *      with PCM voices that mirror web/js/sequencer.js (see the render
 *      section below for the exact parameter mapping / approximations).
 *   3. Logs in (or signs up, then logs in) as the house account, makes
 *      sure the account's wallet is the studio wallet, and uploads the
 *      WAV through the real API (POST /v1/beats/upload), which fires
 *      register-on-upload because `producerAddress` is sent.
 *   4. Marks the beat as the house beat (Beat.isHouse). There is no API
 *      endpoint for that flag, so the script PRINTS the exact SQL to run
 *      and — only when DATABASE_URL is set in the environment — also
 *      attempts the update directly through the backend's own Prisma
 *      client. Failure there is a warning, never fatal.
 *
 * Idempotent: if the house account already owns a beat titled
 * "First Light (House Beat)", the upload is skipped (exit 0).
 *
 * Configuration — environment variables ONLY (nothing secret is ever
 * printed or hardcoded):
 *   VB_API_BASE          API base URL. Default: http://localhost:4000
 *   HOUSE_SEED_EMAIL     House account email.     REQUIRED for a full run.
 *   HOUSE_SEED_PASSWORD  House account password.  REQUIRED for a full run.
 *   HOUSE_SEED_USERNAME  Username if signing up.  Default: "vteam"
 *   STUDIO_WALLET        Studio / producer wallet.
 *                        Default: 0xEed0867dA5d387DAE2c548A4620c43cb26a9D517
 *   DATABASE_URL         Optional. When set, the isHouse update is also
 *                        attempted via Prisma (value is never printed).
 *
 * Usage:
 *   node scripts/seed-house-beat.cjs --render-only [out.wav]
 *       Render the WAV locally (default ./first-light-house-beat.wav)
 *       and exit. No network calls, no credentials needed.
 *   HOUSE_SEED_EMAIL=... HOUSE_SEED_PASSWORD=... node scripts/seed-house-beat.cjs
 *       Full seed run against VB_API_BASE (default http://localhost:4000).
 *
 * NOTE: do not point VB_API_BASE at production unless you mean it — this
 * creates a real account (if missing) and a real beat.
 */

const fs = require('node:fs');
const path = require('node:path');

const L = require('../web/js/pattern-logic.js');

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const TITLE = 'First Light (House Beat)';
const GENRE = 'Hip-Hop';
const DESC =
  'The first beat in the house — built by the V Team to open the floor. ' +
  'If it moves you, vote it up.';
const WAV_FILENAME = 'first-light-house-beat.wav';
const BARS = 4;
const SAMPLE_RATE = 44100;
const TAIL_SEC = 0.3; // matches sequencer.js renderWav(): decay tail so the
                      // last hits ring out instead of clipping off.

const DEFAULT_API_BASE = 'http://localhost:4000';
const DEFAULT_USERNAME = 'vteam';
const DEFAULT_STUDIO_WALLET = '0xEed0867dA5d387DAE2c548A4620c43cb26a9D517';

/* ------------------------------------------------------------------ */
/* Pattern — exactly the co-producer flow (web/js/coproducer.js and    */
/* test-coproducer.cjs): frame -> bass rides kick -> Forte's melody.   */
/* rideBassline RETURNS the bass row and findSpace RETURNS an object,  */
/* so both results must be assigned back onto the pattern. findSpace   */
/* reads pattern.bass when counting layers, so bass goes first.        */
/* ------------------------------------------------------------------ */

function buildHousePattern() {
  const f = L.buildFrame('boombap'); // Volt: boom bap frame, bpm 90
  const pattern = L.emptyPattern(f.bpm);
  pattern.kick = f.kick;
  pattern.snare = f.snare;
  pattern.hat = f.hat;
  pattern.bass = L.rideBassline(pattern); // Bass: root on every kick + pickups
  const space = L.findSpace(pattern); // Forte: sparse melody, vocal half clear
  pattern.melody = space.melody;
  return pattern;
}

/* ------------------------------------------------------------------ */
/* Offline PCM render — mirrors the voices in web/js/sequencer.js.     */
/*                                                                     */
/* The browser renders these with Web Audio nodes (OscillatorNode /    */
/* BiquadFilterNode / GainNode with exponential ramps). Node has no    */
/* Web Audio, so each voice is synthesized sample-by-sample here:     */
/*   - frequency / gain exponential ramps use the same endpoints and   */
/*     durations as sequencer.js, evaluated analytically per sample;   */
/*   - filters are RBJ-cookbook biquads (the Web Audio BiquadFilter    */
/*     is the same family) with the same types / frequencies and the   */
/*     Web Audio default Q = 1;                                        */
/*   - noise is white noise from a SEEDED PRNG (mulberry32) instead    */
/*     of Math.random(), so every render of this seed beat is         */
/*     byte-identical — a seed asset should not change between runs.   */
/* This is a generated demo beat: the approximations are intentional   */
/* and inaudible for this purpose, but it is not a bit-exact copy of   */
/* a browser OfflineAudioContext render.                             */
/* ------------------------------------------------------------------ */

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mf = (m) => 440 * Math.pow(2, (m - 69) / 12); // sequencer.js: midi -> Hz

/* GainNode.exponentialRampToValueAtTime(0.001, t + dur) starting at vol:
 * gain(t) = vol * (0.001 / vol) ^ (t / dur). */
function expGain(vol, dur, t) {
  return vol * Math.exp(Math.log(0.001 / vol) * (t / dur));
}

/* RBJ biquad coefficients (lowpass / highpass / bandpass-skirt), Q = 1
 * (the Web Audio BiquadFilterNode default). */
function biquad(type, freq, q, sr) {
  const w = (2 * Math.PI * freq) / sr;
  const alpha = Math.sin(w) / (2 * q);
  const cos = Math.cos(w);
  let b0, b1, b2;
  const a0 = 1 + alpha;
  const a1 = -2 * cos;
  const a2 = 1 - alpha;
  if (type === 'lowpass') {
    b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = (1 - cos) / 2;
  } else if (type === 'highpass') {
    b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = (1 + cos) / 2;
  } else { // bandpass (constant skirt gain, as in Web Audio)
    b0 = alpha; b1 = 0; b2 = -alpha;
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0, x1: 0, x2: 0, y1: 0, y2: 0 };
}
function biquadStep(f, x) {
  const y = f.b0 * x + f.b1 * f.x1 + f.b2 * f.x2 - f.a1 * f.y1 - f.a2 * f.y2;
  f.x2 = f.x1; f.x1 = x; f.y2 = f.y1; f.y1 = y;
  return y;
}

/* sequencer.js kick(): sine, freq exp 160 -> 48 over 0.12 s,
 * gain 0.9 exp-decay to 0.001 over 0.24 s, osc stops at 0.26 s. */
function addKick(out, start, sr) {
  let phase = 0;
  const n = Math.ceil(0.26 * sr);
  for (let i = 0; i < n && start + i < out.length; i++) {
    const t = i / sr;
    const freq = t < 0.12 ? 160 * Math.pow(48 / 160, t / 0.12) : 48;
    phase += (2 * Math.PI * freq) / sr;
    out[start + i] += Math.sin(phase) * expGain(0.9, 0.24, t);
  }
}

/* sequencer.js noiseHit(): white noise -> biquad -> gain exp-decay.
 * snare(): dur 0.16, bandpass 1800 Hz, vol 0.5.
 * hat():   dur 0.05, highpass 7200 Hz, vol 0.22. */
function addNoiseHit(out, start, sr, rng, dur, filterType, freq, vol) {
  const f = biquad(filterType, freq, 1, sr);
  const n = Math.ceil((dur + 0.02) * sr);
  for (let i = 0; i < n && start + i < out.length; i++) {
    const t = i / sr;
    const white = rng() * 2 - 1;
    out[start + i] += biquadStep(f, white) * expGain(vol, dur, t);
  }
}

/* sequencer.js tone(): osc -> lowpass (700 Hz triangle / 2600 Hz square)
 * -> gain exp-decay. bass: triangle, vol 0.5, dur 0.22.
 * melody: square, vol 0.14, dur 0.18. */
function addTone(out, start, sr, midi, type, vol, dur) {
  const f = biquad('lowpass', type === 'triangle' ? 700 : 2600, 1, sr);
  const freq = mf(midi);
  let phase = 0;
  const n = Math.ceil((dur + 0.02) * sr);
  for (let i = 0; i < n && start + i < out.length; i++) {
    const t = i / sr;
    phase += (2 * Math.PI * freq) / sr;
    const s = Math.sin(phase);
    // Triangle via the arcsine identity, exactly the sine's harmonic shape.
    const osc = type === 'triangle' ? (2 / Math.PI) * Math.asin(Math.max(-1, Math.min(1, s))) : s >= 0 ? 1 : -1;
    out[start + i] += biquadStep(f, osc) * expGain(vol, dur, t);
  }
}

/* sequencer.js playStepInto(): same voice set, same step order. */
function playStepInto(out, start, sr, rng, pat, i) {
  if (pat.kick[i]) addKick(out, start, sr);
  if (pat.snare[i]) addNoiseHit(out, start, sr, rng, 0.16, 'bandpass', 1800, 0.5);
  if (pat.hat[i]) addNoiseHit(out, start, sr, rng, 0.05, 'highpass', 7200, 0.22);
  if (pat.bass[i] != null) addTone(out, start, sr, pat.bass[i], 'triangle', 0.5, 0.22);
  if (pat.melody[i] != null) addTone(out, start, sr, pat.melody[i], 'square', 0.14, 0.18);
}

/* Render `bars` loops of the bar, mono. Frame count and the 0.05 s
 * start offset mirror sequencer.js renderWav() (which renders stereo
 * from the same mono pattern; encodeWav() gets one channel here). */
function renderPattern(pattern, bars) {
  const loops = bars || BARS;
  const sr = SAMPLE_RATE;
  const stepDur = 60 / pattern.bpm / 4; // one sixteenth note
  const totalSteps = L.STEPS * loops;
  const frames = Math.ceil((stepDur * totalSteps + TAIL_SEC) * sr);
  const samples = new Float32Array(frames);
  const rng = mulberry32(0x5eed); // deterministic noise, render to render
  for (let s = 0; s < totalSteps; s++) {
    const start = Math.round((0.05 + s * stepDur) * sr);
    playStepInto(samples, start, sr, rng, pattern, s % L.STEPS);
  }
  return samples;
}

function renderHouseWav() {
  const pattern = buildHousePattern();
  const samples = renderPattern(pattern, BARS);
  const wav = L.encodeWav([samples], SAMPLE_RATE); // 16-bit PCM, mono
  return { pattern, samples, wav };
}

/* ------------------------------------------------------------------ */
/* HTTP helpers (global fetch; error shape mirrors web/js/api.js)      */
/* ------------------------------------------------------------------ */

async function apiJson(apiBase, pathname, { method = 'GET', token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(apiBase + pathname, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON response */ }
  if (!res.ok) {
    const msg = (data && (data.error?.message || data.message)) || 'HTTP ' + res.status;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

/* The real auth controller (tokenService.authResponse) returns
 * { token, refreshToken, user } — the access token field is `token`.
 * web/js/api.js also accepts `accessToken`; mirror both. */
function extractToken(data) {
  if (!data) return null;
  return data.token || data.accessToken || null;
}

async function login(apiBase, email, password) {
  const data = await apiJson(apiBase, '/v1/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  const token = extractToken(data);
  if (!token) throw new Error('Login succeeded but the response carried no token');
  return token;
}

async function signupThenLogin(apiBase, email, password, username) {
  let signupToken = null;
  try {
    const data = await apiJson(apiBase, '/v1/auth/signup', {
      method: 'POST',
      body: { email, password, username },
    });
    signupToken = extractToken(data); // signup returns a token pair too
  } catch (err) {
    // 409 = account already exists (e.g. created between login attempts):
    // fall through and let the login below decide.
    if (err.status !== 409) throw err;
  }
  try {
    return await login(apiBase, email, password);
  } catch (err) {
    if (signupToken) return signupToken; // the signup-issued token is valid
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/* isHouse marking — no API endpoint exists for the flag. Print the    */
/* exact SQL always; when DATABASE_URL is set, also try Prisma.        */
/* ------------------------------------------------------------------ */

function houseSql(beatId) {
  return `UPDATE "Beat" SET "isHouse" = true WHERE id = '${beatId}';`;
}

async function markHouse(beatId) {
  const sql = houseSql(beatId);
  console.log('\nMark this beat as the house beat — run this SQL against the backend database:');
  console.log('  ' + sql);
  if (!process.env.DATABASE_URL) {
    console.log('(DATABASE_URL is not set, so the update was not attempted automatically.)');
    return;
  }
  try {
    // The backend's own installed Prisma client (no new dependency).
    const { PrismaClient } = require('../backend/node_modules/@prisma/client');
    const prisma = new PrismaClient();
    try {
      await prisma.beat.update({ where: { id: beatId }, data: { isHouse: true } });
      console.log('DATABASE_URL is set: isHouse update applied via Prisma.');
    } finally {
      await prisma.$disconnect();
    }
  } catch (err) {
    console.warn('Warning: Prisma isHouse update failed (' + err.message + '). Run the SQL above manually.');
  }
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage:');
    console.log('  node scripts/seed-house-beat.cjs --render-only [out.wav]   # local render, no network');
    console.log('  HOUSE_SEED_EMAIL=... HOUSE_SEED_PASSWORD=... node scripts/seed-house-beat.cjs');
    console.log('Env: VB_API_BASE (default ' + DEFAULT_API_BASE + '), HOUSE_SEED_EMAIL,');
    console.log('     HOUSE_SEED_PASSWORD, HOUSE_SEED_USERNAME (default "' + DEFAULT_USERNAME + '"),');
    console.log('     STUDIO_WALLET, DATABASE_URL (optional, enables the automatic isHouse update)');
    return;
  }

  /* --render-only: build + render + write the WAV, then exit.
   * No network, no credentials required. */
  const renderOnlyAt = args.indexOf('--render-only');
  if (renderOnlyAt !== -1) {
    const outPath = args[renderOnlyAt + 1] || './first-light-house-beat.wav';
    const { pattern, wav } = renderHouseWav();
    fs.writeFileSync(outPath, Buffer.from(wav));
    const secs = L.patternDurationSec(pattern.bpm, BARS);
    console.log('Rendered ' + path.resolve(outPath));
    console.log(
      '  pattern: boom bap @ ' + pattern.bpm + ' BPM, ' + BARS + ' bars, ' +
      L.countHits(pattern) + ' hits/bar, duration ' + secs.toFixed(3) + 's + ' + TAIL_SEC + 's tail'
    );
    console.log('  wav: ' + wav.length + ' bytes, ' + SAMPLE_RATE + ' Hz, 16-bit PCM, mono');
    return;
  }

  /* Config — env only. Values are never printed. */
  const apiBase = (process.env.VB_API_BASE || DEFAULT_API_BASE).replace(/\/+$/, '');
  const email = process.env.HOUSE_SEED_EMAIL;
  const password = process.env.HOUSE_SEED_PASSWORD;
  const username = process.env.HOUSE_SEED_USERNAME || DEFAULT_USERNAME;
  const studioWallet = process.env.STUDIO_WALLET || DEFAULT_STUDIO_WALLET;

  if (!email || !password) {
    console.error('Error: HOUSE_SEED_EMAIL and HOUSE_SEED_PASSWORD are both required.');
    console.error('Set them in the environment (they are never printed) and re-run, e.g.:');
    console.error('  HOUSE_SEED_EMAIL=... HOUSE_SEED_PASSWORD=... node scripts/seed-house-beat.cjs');
    console.error('Or render the beat locally without an account:');
    console.error('  node scripts/seed-house-beat.cjs --render-only');
    process.exit(1);
  }
  if (/onrender\.com/.test(apiBase)) {
    console.warn('Warning: VB_API_BASE points at the hosted API (' + apiBase + '). Continuing — Ctrl-C now if that was not intended.');
  }

  /* Auth: login; if that fails, sign up and log in. */
  let token;
  try {
    token = await login(apiBase, email, password);
    console.log('Logged in as the house account.');
  } catch (err) {
    console.log('Login failed (' + err.message + ') — signing up, then logging in.');
    token = await signupThenLogin(apiBase, email, password, username);
    console.log('House account ready.');
  }

  /* Point the account's wallet at the studio wallet (self-update
   * endpoint: PUT /v1/users/profile accepts { wallet }). Non-fatal. */
  try {
    await apiJson(apiBase, '/v1/users/profile', {
      method: 'PUT',
      token,
      body: { wallet: studioWallet },
    });
    console.log('Account wallet set to the studio wallet.');
  } catch (err) {
    console.warn('Warning: could not set the account wallet (' + err.message + '). Continuing; the upload still names the studio wallet as producerAddress.');
  }

  /* Idempotency: an existing beat with this title on this account
   * means the seed already ran — report it and stop. */
  const mine = await apiJson(apiBase, '/v1/beats/user', { token });
  const existing = (mine.beats || []).find((b) => b.title === TITLE);
  if (existing) {
    console.log('House beat already exists for this account — skipping upload.');
    console.log('  existing beat id: ' + existing.id);
    await markHouse(existing.id);
    console.log('\nSummary');
    console.log('  beat id : ' + existing.id + ' (pre-existing)');
    console.log('  title   : ' + TITLE);
    console.log('  api base: ' + apiBase);
    return;
  }

  /* Build + render the beat. */
  const pattern = buildHousePattern();
  const samples = renderPattern(pattern, BARS);
  const wav = L.encodeWav([samples], SAMPLE_RATE);
  const durSec = Math.round(L.patternDurationSec(pattern.bpm, BARS));

  /* Upload — multipart fields per beatsController.uploadBeat:
   * file field "audio"; title / genre / bpm / price / desc / dur;
   * producerAddress (string) triggers register-on-upload. */
  const form = new FormData();
  form.append('audio', new Blob([wav], { type: 'audio/wav' }), WAV_FILENAME);
  form.append('title', TITLE);
  form.append('genre', GENRE);
  form.append('bpm', String(pattern.bpm));
  form.append('price', '0');
  form.append('desc', DESC);
  form.append('dur', String(durSec));
  form.append('producerAddress', studioWallet);

  const res = await fetch(apiBase + '/v1/beats/upload', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token },
    body: form,
  });
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON response */ }
  if (!res.ok) {
    const msg = (data && (data.error?.message || data.message)) || 'HTTP ' + res.status;
    throw new Error('Upload failed: ' + msg);
  }
  const beatId = data && data.id;
  if (!beatId) throw new Error('Upload succeeded but the response carried no beat id');
  console.log('Uploaded house beat: ' + beatId);

  await markHouse(beatId);

  console.log('\nSummary');
  console.log('  beat id : ' + beatId);
  console.log('  title   : ' + TITLE);
  console.log('  duration: ' + durSec + 's (' + BARS + ' bars @ ' + pattern.bpm + ' BPM)');
  console.log('  api base: ' + apiBase);
}

main().catch((err) => {
  console.error('Error: ' + err.message);
  process.exit(1);
});
