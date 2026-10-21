/* PatternLogic — pure step-sequencer pattern math for the VBeats studio.
   No DOM, no audio: plain pattern objects in, plain pattern objects out.
   Works in the browser (window.PatternLogic) and in node (module.exports)
   so the co-producer actions can be tested headlessly.

   Pattern model — one bar of 16 sixteenth steps:
   {
     bpm: number,
     kick:  [0|1 x16], snare: [0|1 x16], hat: [0|1 x16],
     bass:   [midiNote|null x16],   // follows the kick
     melody: [midiNote|null x16]    // sparse, leaves vocal space
   } */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PatternLogic = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const STEPS = 16;
  const MINOR = [0, 2, 3, 5, 7, 8, 10];       // natural minor intervals
  const PENTA = [0, 3, 5, 7, 10, 12];          // minor pentatonic (+ octave)
  const BASS_ROOT = 33;                        // A1
  const MELODY_ROOT = 57;                      // A3

  const zeros = () => Array(STEPS).fill(0);
  const nulls = () => Array(STEPS).fill(null);
  const on = (steps) => { const a = zeros(); steps.forEach(s => { a[s] = 1; }); return a; };

  function emptyPattern(bpm) {
    return { bpm: bpm || 95, kick: zeros(), snare: zeros(), hat: zeros(), bass: nulls(), melody: nulls() };
  }
  function clone(p) {
    return { bpm: p.bpm, kick: p.kick.slice(), snare: p.snare.slice(), hat: p.hat.slice(), bass: p.bass.slice(), melody: p.melody.slice() };
  }
  function trackHits(arr) { return arr.reduce((n, v) => n + (v ? 1 : 0), 0); }
  function countHits(p) {
    return trackHits(p.kick) + trackHits(p.snare) + trackHits(p.hat) + trackHits(p.bass) + trackHits(p.melody);
  }
  function activeLayers(p) {
    return ['kick', 'snare', 'hat', 'bass', 'melody'].filter(k => trackHits(p[k]) > 0).length;
  }
  function noteName(midi) {
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    return names[midi % 12] + (Math.floor(midi / 12) - 1);
  }

  /* ---------- Volt: starter frames per style ---------- */
  const STYLES = {
    boombap: { name: 'Boom Bap', bpm: 90 },
    trap: { name: 'Trap', bpm: 140 },
    house: { name: 'House', bpm: 124 },
  };
  function buildFrame(styleKey) {
    const style = STYLES[styleKey] || STYLES.boombap;
    let kick, snare, hat;
    if (styleKey === 'trap') {
      kick = on([0, 6, 10]);                       // syncopated, leans forward
      snare = on([8]);                             // half-time crack
      hat = on([0, 2, 3, 4, 6, 7, 8, 10, 11, 12, 14, 15]); // 8ths + roll tails
    } else if (styleKey === 'house') {
      kick = on([0, 4, 8, 12]);                    // four on the floor
      snare = on([4, 12]);                         // clap slots
      hat = on([2, 6, 10, 14, 15]);                // offbeats + pickup
    } else {
      kick = on([0, 3, 6, 10]);                    // swung-feel placement
      snare = on([4, 12]);
      hat = on([0, 2, 4, 6, 8, 10, 12, 14]);       // straight 8ths
    }
    return { style: styleKey in STYLES ? styleKey : 'boombap', name: style.name, bpm: style.bpm, kick, snare, hat };
  }

  /* ---------- Bass: bassline that rides the kick ---------- */
  function rideBassline(pattern, root) {
    const r = root == null ? BASS_ROOT : root;
    const bass = nulls();
    const kicks = [];
    pattern.kick.forEach((v, i) => { if (v) kicks.push(i); });
    kicks.forEach((s, idx) => {
      bass[s] = r;                                            // root on every kick
      const next = kicks[idx + 1];
      if (next != null && next - s >= 4 && bass[s + 2] === null) {
        bass[s + 2] = r + 7;                                  // fifth pickup in a wide gap
      }
      if (next == null && s + 2 < STEPS && bass[s + 2] === null) {
        bass[s + 2] = r + 12;                                 // octave lift before the loop turns
      }
    });
    return bass;
  }

  /* ---------- Forte: sparse melody that leaves vocal space ---------- */
  function findSpace(pattern, root) {
    const r = root == null ? MELODY_ROOT : root;
    const layerCount = i =>
      (pattern.kick[i] ? 1 : 0) + (pattern.snare[i] ? 1 : 0) +
      (pattern.hat[i] ? 1 : 0) + (pattern.bass[i] != null ? 1 : 0);
    const open = i => !pattern.snare[i] && layerCount(i) <= 1;  // never talk over the crack; only genuinely open steps
    // Arrange like a record: the melody phrase lives in ONE half of the bar,
    // the other half stays completely clear — that whole half is vocal space.
    const halves = [[0, 7], [8, 15]];
    const openCount = h => { let n = 0; for (let i = h[0]; i <= h[1]; i++) if (open(i)) n++; return n; };
    const melHalf = openCount(halves[1]) > openCount(halves[0]) ? 1 : 0;
    const vocHalf = halves[1 - melHalf];
    const melody = nulls();
    const picked = [];
    for (let i = halves[melHalf][0]; i <= halves[melHalf][1]; i++) {
      if (picked.length >= 4) break;
      if (!open(i)) continue;
      if (picked.length && i - picked[picked.length - 1] < 2) continue; // breathing room inside the phrase
      picked.push(i);
      melody[i] = r + PENTA[picked.length % PENTA.length];
    }
    return {
      melody,
      noteCount: picked.length,
      crowded: picked.length === 0,
      vocalFrom: vocHalf[0],
      vocalTo: vocHalf[1],
      vocalLen: vocHalf[1] - vocHalf[0] + 1,
    };
  }

  /* ---------- Gwei: the 5-second test (honest heuristics) ---------- */
  function fiveSecondTest(pattern) {
    const openingHits = [0, 1, 2, 3].reduce((n, i) =>
      n + (pattern.kick[i] ? 1 : 0) + (pattern.snare[i] ? 1 : 0) + (pattern.hat[i] ? 1 : 0) +
      (pattern.bass[i] != null ? 1 : 0) + (pattern.melody[i] != null ? 1 : 0), 0);
    const totalHits = countHits(pattern);
    const layers = activeLayers(pattern);
    const density = totalHits / (STEPS * 5);
    const kickOnZero = pattern.kick[0] === 1;
    const snareAnchored = pattern.snare[4] === 1 || pattern.snare[8] === 1 || pattern.snare[12] === 1;
    const metrics = { openingHits, totalHits, layers, density: Math.round(density * 100) / 100, kickOnZero, snareAnchored };
    const reasons = [];
    let verdict;
    if (totalHits < 8 || openingHits === 0) {
      verdict = 'empty';
      reasons.push(openingHits === 0 ? 'nothing lands in the first beat' : 'only ' + totalHits + ' hits in the whole bar');
    } else if (density > 0.42) {
      verdict = 'busy';
      reasons.push(Math.round(density * 100) + '% of the grid is filled — no room to breathe');
    } else if (!kickOnZero) {
      verdict = 'no-anchor';
      reasons.push('no kick on step 1, so the ear has nothing to grab');
    } else if (snareAnchored) {
      verdict = 'lands';
      reasons.push('kick opens the bar and the snare is where a listener expects it');
    } else {
      verdict = 'no-anchor';
      reasons.push('kick opens the bar, but no snare lands on a main beat to confirm it');
    }
    return { verdict, metrics, reasons };
  }

  /* ---------- Strip it back: kick, snare, core hats, one accent ---------- */
  function stripBack(pattern) {
    const p = clone(pattern);
    const before = countHits(p);
    p.hat = p.hat.map((v, i) => (i % 4 === 0 ? v : 0));       // hats only on the quarters
    p.bass = p.bass.map((v, i) => ((i === 0 || i === 8) && p.kick[i] ? v : null)); // bar-anchor roots
    if (trackHits(p.bass) === 0) {                            // no anchor survived: keep the first kick-locked root
      const s = pattern.bass.findIndex((v, i) => v != null && pattern.kick[i]);
      if (s >= 0) p.bass[s] = pattern.bass[s];
    }
    let accentKept = false;                                    // melody: first note only — the one accent
    p.melody = p.melody.map(v => { if (v != null && !accentKept) { accentKept = true; return v; } return null; });
    return { pattern: p, removed: before - countHits(p), accentKept };
  }

  return { STEPS, MINOR, PENTA, BASS_ROOT, MELODY_ROOT, STYLES,
    emptyPattern, clone, trackHits, countHits, activeLayers, noteName,
    buildFrame, rideBassline, findSpace, fiveSecondTest, stripBack };
});
