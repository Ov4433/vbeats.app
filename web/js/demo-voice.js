/* DemoVoice — Meta API pieces, live transport added Nov 8 at Star's "Let's do that".
   STATUS: $150 credits NEVER landed (Oct 26 claim, Oct 30 resubmit, still $0).
   Live use from here is PAID usage on the card on file (Visa ending 3018,
   $20 pay threshold, $150 spend notification set) — a short Spark test is
   cents, not $150, but it IS a charge. Star authorized live wiring Nov 8.
   The key itself is NEVER in this file, NEVER pasted to Muse, and
   NEVER committed. The only place it may live is this browser's
   localStorage, set by Star on his own machine with DemoVoice.setLocalKey()
   or the key field on the Studio page — that storage stays on his device.
   LIVE TRANSPORT (per the Meta docs / Star's Oct 30 snippet):
     Spark 1.3: POST https://api.meta.ai/v1/responses
       { model: "muse-spark-1.3", input: "<prompt>" }, Bearer key.
     Voice Transcribe file: POST https://api.meta.ai/v1/asr/transcribe
       FormData { file: <audio blob>, model: "muse-voice-transcribe-1.0" }.
     Realtime WebSocket (wss://api.meta.ai/v1/asr/realtime) is NOT wired
     yet — file transcription is the first live Transcribe step.
   Until testLiveSpark() succeeds in this browser, the local fallback
   stays active and the screen must say so honestly.
   UMD: node-testable (status + fallback paths need no browser; live
   functions safely report "no key / no fetch" in Node). */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DemoVoice = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const KEY_STORAGE = 'vbeats-meta-api-key';
  const API_BASE = 'https://api.meta.ai/v1';
  const SPARK_MODEL = 'muse-spark-1.3';
  const TRANSCRIBE_MODEL = 'muse-voice-transcribe-1.0';
  let liveVerified = false;
  const GATE_REASON = 'GATED: Live Meta API calls not yet verified — ' +
    'account + key created Star-side 2026-10-26, but the live transport ' +
    'has not been tested end to end. Local fallback is active.';

  /* Local-only key vault. The key lives ONLY in this browser's
     localStorage, set by Star on his own machine. It is never read
     back out as a value, never logged, never sent to Muse, and never
     written to any file. In Node (tests) there is no localStorage,
     so these safely report absent. */
  function hasLocalKey() {
    try {
      if (typeof localStorage === 'undefined') return false;
      const v = localStorage.getItem(KEY_STORAGE);
      return typeof v === 'string' && v.length > 0;
    } catch (e) { return false; }
  }
  function setLocalKey(key) {
    try {
      const clean = String(key || '').trim();
      if (!clean || typeof localStorage === 'undefined') return false;
      localStorage.setItem(KEY_STORAGE, clean);
      return true;
    } catch (e) { return false; }
  }
  function clearLocalKey() {
    try {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(KEY_STORAGE);
    } catch (e) {}
    return true;
  }

  function getLocalKey() {
    try {
      if (typeof localStorage === 'undefined') return null;
      const v = localStorage.getItem(KEY_STORAGE);
      return typeof v === 'string' && v.length > 0 ? v : null;
    } catch (e) { return null; }
  }
  function status() {
    if (liveVerified) {
      return { live: true, mode: 'live', hasLocalKey: true,
        reason: 'Live Meta API verified in this browser by a successful Spark test call. Paid usage — credits never landed.' };
    }
    if (hasLocalKey()) {
      return { live: false, mode: 'live-ready-local-key', hasLocalKey: true,
        reason: 'A key is present in this browser only. Live calls are ' +
          'still unverified until the transport is tested — fallback stays on.' };
    }
    return { live: false, mode: 'local-fallback', hasLocalKey: false, reason: GATE_REASON };
  }

  /* Extract plain text from a Responses-API result, across the shapes
     the API returns (output_text, output[].content[].text). */
  function extractText(data) {
    if (!data) return '';
    if (typeof data.output_text === 'string' && data.output_text) return data.output_text;
    if (Array.isArray(data.output)) {
      const parts = [];
      data.output.forEach(o => {
        if (Array.isArray(o.content)) o.content.forEach(c => {
          if (typeof c.text === 'string') parts.push(c.text);
          if (typeof c.output_text === 'string') parts.push(c.output_text);
        });
      });
      if (parts.length) return parts.join('');
    }
    if (typeof data.text === 'string') return data.text;
    return '';
  }

  /* 30-second timeout for every live Meta call. Without it a slow or
     hung request leaves the UI stuck on "Testing…" forever — that is
     what happened on Star's phone: the button never came back. On abort
     the caller gets a local-fallback result, not a hang, and a request
     that never answered cannot have been charged. */
  const LIVE_TIMEOUT_MS = 30000;
  async function fetchLive(url, options) {
    if (typeof AbortController === 'undefined' || typeof fetch === 'undefined') {
      return fetch(url, options);
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), LIVE_TIMEOUT_MS);
    try {
      return await fetch(url, Object.assign({}, options, { signal: ctrl.signal }));
    } finally {
      clearTimeout(timer);
    }
  }
  function timeoutError(e) {
    return !!(e && e.name === 'AbortError');
  }
  const TIMEOUT_MSG = 'Timed out after 30s — no charge if it never answered';

  /* One short Spark call. This is the smoke test: a few hundred tokens,
     cents at Standard pricing ($1.25 in / $4.25 out per 1M), paid on the
     card on file because credits never landed. Returns
     { mode: 'live', text } on success, or { mode: 'local-fallback', error }
     on any failure — the caller must fall back, never hang. */
  async function testLiveSpark() {
    const key = getLocalKey();
    if (!key) return { mode: 'local-fallback', error: 'No key in this browser. Save your key in this browser only first.' };
    if (typeof fetch === 'undefined') return { mode: 'local-fallback', error: 'fetch is unavailable in this environment.' };
    try {
      const res = await fetchLive(API_BASE + '/responses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
        body: JSON.stringify({ model: SPARK_MODEL, input: 'Reply in one short sentence: what is the capital of France?' })
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        return { mode: 'local-fallback', error: 'Spark returned HTTP ' + res.status + (body ? ': ' + body.slice(0, 200) : '') };
      }
      const data = await res.json();
      const text = extractText(data);
      if (!text) return { mode: 'local-fallback', error: 'Spark returned no text.' };
      liveVerified = true;
      return { mode: 'live', text, model: SPARK_MODEL };
    } catch (e) {
      if (timeoutError(e)) return { mode: 'local-fallback', error: TIMEOUT_MSG };
      return { mode: 'local-fallback', error: String(e && e.message ? e.message : e) };
    }
  }

  /* Agent thinking, live form: Spark reads a short prompt and returns
     an in-character line. Falls back to the local line on any failure. */
  async function thinkLive(bat, prompt, localLine) {
    const key = getLocalKey();
    if (!key) return { mode: 'local-fallback', bat, line: localLine || '', live: false, error: 'No key in this browser.' };
    if (typeof fetch === 'undefined') return { mode: 'local-fallback', bat, line: localLine || '', live: false };
    try {
      const res = await fetchLive(API_BASE + '/responses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
        body: JSON.stringify({ model: SPARK_MODEL, input: String(prompt || localLine || '') })
      });
      if (!res.ok) return { mode: 'local-fallback', bat, line: localLine || '', live: false, error: 'HTTP ' + res.status };
      const text = extractText(await res.json());
      if (!text) return { mode: 'local-fallback', bat, line: localLine || '', live: false };
      liveVerified = true;
      return { mode: 'live', bat, line: text.trim(), live: true };
    } catch (e) {
      if (timeoutError(e)) return { mode: 'local-fallback', bat, line: localLine || '', live: false, error: TIMEOUT_MSG };
      return { mode: 'local-fallback', bat, line: localLine || '', live: false, error: String(e && e.message ? e.message : e) };
    }
  }

  /* Voice Transcribe, file form: send a recorded audio blob, get words
     back. This is the first live Transcribe step; realtime WebSocket
     is not wired yet. Returns { mode: 'live', text } or fallback. */
  async function transcribeAudioFile(blob) {
    const key = getLocalKey();
    if (!key) return { mode: 'local-fallback', error: 'No key in this browser.' };
    if (!blob || typeof fetch === 'undefined' || typeof FormData === 'undefined') {
      return { mode: 'local-fallback', error: 'Audio file or fetch unavailable.' };
    }
    try {
      const fd = new FormData();
      fd.append('file', blob, 'take.webm');
      fd.append('model', TRANSCRIBE_MODEL);
      const res = await fetchLive(API_BASE + '/asr/transcribe', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + key },
        body: fd
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        return { mode: 'local-fallback', error: 'Transcribe returned HTTP ' + res.status + (body ? ': ' + body.slice(0, 200) : '') };
      }
      const data = await res.json();
      const text = data.text || data.transcript || extractText(data) || '';
      if (!text) return { mode: 'local-fallback', error: 'Transcribe returned no text.' };
      liveVerified = true;
      return { mode: 'live', text };
    } catch (e) {
      if (timeoutError(e)) return { mode: 'local-fallback', error: TIMEOUT_MSG };
      return { mode: 'local-fallback', error: String(e && e.message ? e.message : e) };
    }
  }

  /* Voice direction in. LIVE form: spoken words over WebSocket to Muse
     Voice Transcribe (realtime speech-to-text; it hears words, not
     notes — melody stays in demo-hum.js). TODAY: typed direction goes
     through the local rule parser, exactly like the studio's
     describe-a-beat path. Returns { mode, text, parsed } where parsed is
     the PatternLogic.parseDescribe output (or null if nothing caught). */
  function transcribeDirection(L, text) {
    const clean = String(text || '').trim();
    if (!clean) return { mode: 'local-fallback', text: '', parsed: null, ignored: [] };
    const parsed = L ? L.parseDescribe(clean) : null;
    return { mode: 'local-fallback', text: clean, parsed,
      ignored: parsed ? parsed.ignored : [] };
  }

  /* Agent thinking. LIVE form: Muse Spark 1.3 reads pattern state +
     the bat's Vault Profile and returns a part + an in-character
     explanation as structured output. TODAY: explanations come from the
     local rule-based lines the studio already uses — the explanation is
     derived from real pattern data, never invented. Callers pass their
     local line in; this wrapper tags it honestly. */
  function think(bat, localLine) {
    return { mode: 'local-fallback', bat, line: localLine || '', live: false };
  }

  /* What the demo screen shows about API state. Never a key, never a
     secret — just the gate and the unblock steps. */
  function gateNotice() {
    if (liveVerified) {
      return 'Voice + Spark: LIVE, verified by a successful test call in this browser. Paid usage — $150 credits never landed.';
    }
    if (hasLocalKey()) {
      return 'Voice + Spark: local fallback active, but a key is present ' +
        'in this browser only. Live Meta API (Voice Transcribe + Spark 1.3) ' +
        'is ready to test — the key never leaves this device or this page.';
    }
    return 'Voice + Spark: local fallback active. Live Meta API (Voice ' +
      'Transcribe + Spark 1.3) unlocks from a key you store in this ' +
      'browser only (DemoVoice.setLocalKey) — no key is needed from you ' +
      'in chat, ever.';
  }

  return { status, transcribeDirection, think, gateNotice, GATE_REASON,
    hasLocalKey, setLocalKey, clearLocalKey,
    testLiveSpark, thinkLive, transcribeAudioFile, SPARK_MODEL, TRANSCRIBE_MODEL };
});
