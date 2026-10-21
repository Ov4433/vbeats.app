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
