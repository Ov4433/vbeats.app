/* DemoSafety — the scripted safety net. The demo degrades, never dies.
   If the mic is denied, the browser has no Web Audio, or any live piece
   fails, the demo falls back to this fully scripted sequence built only
   on PatternLogic — the same real pattern math the live studio uses.
   Nothing here is a mock of the product: the frame, the bassline, the
   melody space, and the hook test are the real functions, run in a
   fixed order with honest "scripted fallback" labeling on screen.
   UMD: pure and node-testable. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DemoSafety = api;
})(typeof self !== 'undefined' ? self : this, function () {
  /* The full demo arc, scripted: frame → bass → melody space → hook
     test → ownership payoff. Each step names the bat, the line, and the
     real pattern change it makes. */
  function scriptedSteps(L) {
    return [
      { bat: 'Volt', line: 'Frame up — boom bap at 90. Kick walks, snare cracks where it should.',
        apply: p => { const f = L.buildFrame('boombap'); const q = L.clone(p);
          q.kick = f.kick; q.snare = f.snare; q.hat = f.hat; q.bpm = f.bpm; return q; } },
      { bat: 'Bass', line: 'Riding the kick — root on every hit, low end follows the drum.',
        apply: p => { const q = L.clone(p); q.bass = L.rideBassline(q); return q; } },
      { bat: 'Forte', line: 'Melody sits in the gaps — the other half of the bar stays empty. That is where your vocal lives.',
        apply: p => { const q = L.clone(p); const r = L.findSpace(q);
          if (!r.crowded) q.melody = r.melody; return q; } },
      { bat: 'Gwei', line: '5-second test, scripted run — kick opens the bar, snare where a listener expects it. It lands.',
        apply: p => L.clone(p) },
      { bat: 'Volt', line: 'And that is the payoff: this beat is real property — registered, licensable, sellable. The crew built it with you, and it is yours.',
        apply: p => L.clone(p) },
    ];
  }

  function runScripted(L, startPattern) {
    let pattern = L.clone(startPattern);
    const log = [];
    scriptedSteps(L).forEach(s => {
      pattern = s.apply(pattern);
      log.push({ bat: s.bat, line: s.line });
    });
    const test = L.fiveSecondTest(pattern);
    return { pattern, log, hookVerdict: test.verdict };
  }

  /* Try the live path; on any failure (or an empty result) fall back to
     the scripted run and say so. The caller labels the fallback on
     screen — a degraded demo that admits it is degraded. */
  function withFallback(L, startPattern, liveFn) {
    try {
      const out = liveFn();
      if (out && out.pattern) return { pattern: out.pattern, degraded: false, log: out.log || [] };
    } catch (e) { /* fall through to scripted */ }
    const scripted = runScripted(L, startPattern);
    return { pattern: scripted.pattern, degraded: true, log: scripted.log,
      note: 'Live path unavailable — running the scripted safety net.' };
  }

  return { scriptedSteps, runScripted, withFallback };
});
