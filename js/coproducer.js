/* Coproducer — the V Team in the session.
   Quiet by default: the panel stays shut until the user opens it, and the
   crew only speaks when called. Every action makes a REAL change to the
   sequencer pattern via the pure functions in pattern-logic.js. */
(function () {
  const L = window.PatternLogic, S = window.StudioSeq;
  if (!L || !S) return;
  const $ = id => document.getElementById(id);
  const body = $('cop-body'), log = $('cop-log');
  if (!body || !log) return;

  $('cop-toggle').onclick = () => {
    const open = body.style.display !== 'none';
    body.style.display = open ? 'none' : '';
    $('cop-toggle').textContent = open ? 'Open the session' : 'Close';
  };

  function say(bat, cls, text) {
    const d = document.createElement('div');
    d.className = 'cop-line ' + cls;
    d.innerHTML = '<b></b><span></span>';
    d.querySelector('b').textContent = bat + ':';
    d.querySelector('span').textContent = ' ' + text;
    log.prepend(d);
  }
  const FRAME_LINES = {
    boombap: "Frame's up — boom bap at 90. Kick walks, snare cracks where it should. Don't decorate it yet; rap on it first.",
    trap: "Frame's up — trap at 140, half-time snare, hats with roll tails. Space is the instrument. Leave it open.",
    house: "Frame's up — house at 124, four on the floor, hats off the beat. Steady pulse; let the bass do the talking.",
    drill: "Frame's up — drill at 142. Kick bounces off the grid, the snare waits for the 3. Nervous energy — don't smooth it out.",
  };

  $('cop-volt').onclick = () => {
    const style = $('cop-style').value;
    const f = L.buildFrame(style);
    const p = S.getPattern();
    p.kick = f.kick; p.snare = f.snare; p.hat = f.hat; p.bpm = f.bpm;
    S.setPattern(p);
    say('Volt', 'bat-volt', FRAME_LINES[f.style]);
  };

  $('cop-bass').onclick = () => {
    const p = S.getPattern();
    if (!L.trackHits(p.kick)) {
      say('Bass', 'bat-bass', "There's no kick to ride yet. Call Volt for a frame first — then I'll lock the low end to it.");
      return;
    }
    p.bass = L.rideBassline(p);
    S.setPattern(p);
    say('Bass', 'bat-bass', "Riding your kick — root on every hit, a fifth pickup where there's room, one lift before the loop turns. Low end follows the drum, never the other way around.");
  };

  $('cop-forte').onclick = () => {
    const p = S.getPattern();
    if (!L.countHits(p)) {
      say('Forte', 'bat-forte', "Silence isn't space yet — it's just empty. Get a frame down, then I'll find where the vocal lives.");
      return;
    }
    const r = L.findSpace(p);
    if (r.crowded) {
      say('Forte', 'bat-forte', "No open steps in this bar — every gap is taken. Strip something back and I'll put a melody where it can breathe.");
      return;
    }
    p.melody = r.melody;
    S.setPattern(p);
    say('Forte', 'bat-forte', 'Melody sits in the gaps — ' + r.noteCount + ' notes, none on top of the snare. Steps ' +
      (r.vocalFrom + 1) + '–' + (r.vocalTo + 1) + ' stay empty: that\'s where your vocal lives. Sing there.');
  };

  $('cop-gwei').onclick = () => {
    const r = L.fiveSecondTest(S.getPattern());
    const lines = {
      lands: "5-second test: it lands. " + r.reasons[0] + " — a normal listener gets it before they can think about it.",
      busy: "5-second test: too busy. " + r.reasons[0] + ". Strip it back and test me again.",
      empty: "5-second test: too empty — " + r.reasons[0] + ". First seconds are the whole audition. Give me a frame.",
      'no-anchor': "5-second test: shaky anchor — " + r.reasons[0] + ". Fix step 1 first; hooks start there.",
    };
    say('Gwei', 'bat-gwei', lines[r.verdict]);
  };

  /* Describe-a-beat: plain words in, a real pattern out. The parser is
     rule-based (pattern-logic.js) — Volt reports exactly what he caught
     and names the words he didn't know instead of guessing. */
  function buildFromDescription() {
    const text = $('cop-desc').value.trim();
    if (!text) {
      say('Volt', 'bat-volt', 'Give me words first — a style, a tempo, a feeling. "Dark boom bap, 92, sparse" and I\'ll build it.');
      return;
    }
    const d = L.parseDescribe(text);
    if (!d.style && !d.bpm && !d.density && !d.mood) {
      say('Volt', 'bat-volt', "I didn't catch anything I can build from that" +
        (d.ignored.length ? ' — words I don\'t know: ' + d.ignored.map(w => "'" + w + "'").join(', ') : '') +
        '. Try a style (boom bap, trap, house, drill), a tempo number, sparse or busy, dark or bright.');
      return;
    }
    const styleKey = d.style || $('cop-style').value;
    const f = L.buildFrame(styleKey);
    const p = S.getPattern();
    p.kick = f.kick; p.snare = f.snare; p.hat = f.hat;
    p.bpm = d.bpm || f.bpm;
    if (d.density) p.hat = L.adjustDensity(p, d.density).hat;
    p.bass = L.rideBassline(p);
    let moodNote = '';
    if (d.mood) {
      const root = d.mood === 'dark' ? L.MELODY_ROOT - 4 : L.MELODY_ROOT + 3;
      const scale = d.mood === 'dark' ? L.MINOR : L.MAJOR_PENTA;
      const r = L.findSpace(p, root, scale);
      if (!r.crowded && r.noteCount) {
        p.melody = r.melody;
        moodNote = d.mood === 'dark' ? ', dark melody low in the register' : ', brighter melody riding higher';
      }
    }
    S.setPattern(p);
    if (d.style) $('cop-style').value = d.style;
    const bits = [f.name + ' frame at ' + p.bpm, 'Bass rode the kick'];
    if (d.density === 'sparse') bits.push('kept it sparse');
    if (d.density === 'busy') bits.push('filled the hats in');
    let line = 'Heard you: ' + bits.join(', ') + moodNote + '.';
    if (d.ignored.length) {
      line += ' Words I didn\'t know: ' + d.ignored.map(w => "'" + w + "'").join(', ') + ' — ignored, not guessed.';
    }
    say('Volt', 'bat-volt', line);
  }
  $('cop-desc-go').onclick = buildFromDescription;
  $('cop-desc').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); buildFromDescription(); }
  });

  $('cop-strip').onclick = () => {
    const r = L.stripBack(S.getPattern());
    if (!r.removed) {
      say('Volt', 'bat-volt', "Already bone. There's nothing left to take away — and taking away was the whole move. Add back only what you actually miss.");
      return;
    }
    S.setPattern(r.pattern);
    say('Volt', 'bat-volt', 'Stripped it — ' + r.removed + ' hits gone. Kick, snare, hats on the quarters' +
      (r.accentKept ? ', and one accent left standing' : '') + ". Everything else was decoration. Now only add back what you miss.");
  };
})();
