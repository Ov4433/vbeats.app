/* DailyLines — one line a day from the V Team, for the studio wall.
   Pure and deterministic: the same date always picks the same line, on
   every device, with no server and no storage. Works in the browser
   (window.DailyLines) and in node (module.exports) for headless tests.

   The bank interleaves the four bats (Volt, Forte, Bass, Gwei), so the
   rotation walks the whole crew before it repeats a voice. Every line
   is an original studio note in that bat's voice — about making beats,
   in the job they actually hold here. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DailyLines = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const LINES = [
    { bat: 'volt',  text: 'Build the frame first. A beat with a spine can survive any mix.' },
    { bat: 'forte', text: 'Leave room for the voice. The empty bar is where the record breathes.' },
    { bat: 'bass',  text: 'Check the low end on small speakers. If it moves there, it moves anywhere.' },
    { bat: 'gwei',  text: 'Five seconds. If the head doesn\u2019t nod, the chart won\u2019t either.' },
    { bat: 'volt',  text: 'Fingerprint everything you make. Receipts are a producer\u2019s memory.' },
    { bat: 'forte', text: 'One great take beats ten almost-takes. Patience is a vocal chain.' },
    { bat: 'bass',  text: 'Foundations before ornaments. Nobody dances to a decoration.' },
    { bat: 'gwei',  text: 'Small position, clean entry. Same rule for trades and drum fills.' },
    { bat: 'volt',  text: 'Night shift rule: finish the loop before you judge the loop.' },
    { bat: 'forte', text: 'Write the hook for the back row, mix it for the front row.' },
    { bat: 'bass',  text: 'Tune the kick to the record, not the record to the kick.' },
    { bat: 'gwei',  text: 'Momentum is a feature. Ship the version that moves, then refine it.' },
    { bat: 'volt',  text: 'A frame is a promise: drums, bass, space. Keep the promise simple.' },
    { bat: 'forte', text: 'The best vocal space is the note you chose not to play.' },
    { bat: 'bass',  text: 'Systems over luck \u2014 save your patterns, name your files, back up the session.' },
    { bat: 'gwei',  text: 'Test cheap, learn fast. A rough demo today beats a perfect plan next month.' },
  ];

  /** Whole days since the Unix epoch, UTC — the daily seed. */
  function dayNumber(date) {
    const d = date ? new Date(date) : new Date();
    return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 86400000);
  }

  /** The line for a date: { bat, text, index }. Same date, same line. */
  function dailyLine(date) {
    const n = dayNumber(date);
    const index = ((n % LINES.length) + LINES.length) % LINES.length;
    const line = LINES[index];
    return { bat: line.bat, text: line.text, index };
  }

  return { LINES, dayNumber, dailyLine };
});
