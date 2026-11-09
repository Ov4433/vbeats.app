/* DemoSpats — crew spats (creative tension) with the LOCKED rails.
   Rails (Star, Oct 26): real triggers only, rare (1–2 per session),
   short (a line each), settled by an audible change, Volt referees,
   producer has the gavel. No canned arguments: a spat only fires on a
   REAL metric from PatternLogic — a hook that does not land, or an
   arrangement too crowded to breathe. The trigger, the number, and the
   fix are all real; only the banter wording is templated, and it is
   one line per bat.
   UMD: evaluate(L, pattern, state) is pure and node-testable. L is the
   PatternLogic module (window.PatternLogic in the browser). */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DemoSpats = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const MAX_PER_SESSION = 2;

  function hashPattern(p) {
    return [p.bpm, p.kick.join(''), p.snare.join(''), p.hat.join(''),
      p.bass.map(v => (v == null ? '-' : v)).join(','),
      p.melody.map(v => (v == null ? '-' : v)).join(',')].join('|');
  }

  /* Evaluate the current pattern for a spat trigger. Returns a spat
     object or null (no trigger, cap reached, or pattern unchanged since
     the last spat — the crew does not re-litigate the same bar). */
  function evaluate(L, pattern, state) {
    const st = state || { count: 0, lastHash: null };
    if (st.count >= MAX_PER_SESSION) return null;
    const h = hashPattern(pattern);
    if (st.lastHash === h) return null;
    const test = L.fiveSecondTest(pattern);
    const density = test.metrics.density;

    if (density > 0.42) {
      return {
        id: 'crowded-' + st.count,
        trigger: 'crowded',
        metric: Math.round(density * 100) + '% of the grid filled',
        lines: [
          { bat: 'Gwei', text: 'Too crowded — ' + Math.round(density * 100) + '% of the grid is full, no room to breathe.' },
          { bat: 'Bass', text: 'The low end is doing its job. Cut the hats, not the bass.' },
        ],
        referee: 'Volt',
        proposal: 'Strip it back: hats to the quarters, one accent left standing.',
        apply: p => L.stripBack(p).pattern,
      };
    }
    if (test.verdict === 'no-anchor') {
      return {
        id: 'hook-' + st.count,
        trigger: 'hook',
        metric: test.reasons[0],
        lines: [
          { bat: 'Gwei', text: 'Hook is not landing — ' + test.reasons[0] + '.' },
          { bat: 'Forte', text: 'It is not the hook, it is the room — nothing anchors step 1.' },
        ],
        referee: 'Volt',
        proposal: 'Anchor step 1 with the kick so the ear has something to grab.',
        apply: p => {
          const q = L.clone(p);
          q.kick[0] = 1;
          return q;
        },
      };
    }
    return null;
  }

  /* The producer has the gavel. 'apply' performs the audible change;
     'leave' keeps the pattern as-is. Either way the spat closes and
     counts against the session cap — the crew does not argue twice. */
  function resolve(L, pattern, spat, choice, state) {
    const st = state || { count: 0, lastHash: null };
    st.count += 1;
    st.lastHash = hashPattern(pattern);
    if (choice === 'apply' && spat && spat.apply) {
      const next = spat.apply(pattern);
      st.lastHash = hashPattern(next);
      return { pattern: next, changed: true, state: st };
    }
    return { pattern, changed: false, state: st };
  }

  function newSession() { return { count: 0, lastHash: null }; }

  return { MAX_PER_SESSION, evaluate, resolve, newSession, hashPattern };
});
