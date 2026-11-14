/* Studio 3-path switcher (Nov 13, Grok studio simplification).
   One job at a time — Record, Pattern, Upload — only the active path is
   visible. The other paths stay in the DOM, so every existing id and
   script (sequencer, crew, Echobeatification, recorder) keeps working.
   Default is Record. Deep-link with #record / #pattern / #upload.
   Pure DOM, no dependencies; safe to load before the inline studio script. */
(function () {
  var TABS = '[data-studio-tab]';
  var PANELS = '[data-studio-path]';
  var NOTE = {
    record: 'Pick a path, do the one job, publish, list licenses. Mic → take → publish.',
    pattern: 'Sequencer grid + the V Team co-producer, Echobeatification and Forte — all on this path. Grid → render → publish.',
    upload: 'Already have audio? The upload wizard fingerprints it and publishes it — three steps.',
  };
  function show(path) {
    if (path !== 'record' && path !== 'pattern' && path !== 'upload') path = 'record';
    document.querySelectorAll(TABS).forEach(function (t) {
      var on = t.getAttribute('data-studio-tab') === path;
      t.classList.toggle('on', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    document.querySelectorAll(PANELS).forEach(function (p) {
      p.classList.toggle('on', p.getAttribute('data-studio-path') === path);
    });
    var note = document.getElementById('studio-path-note');
    if (note) note.textContent = NOTE[path];
    try {
      if (location.hash.replace('#', '') !== path) history.replaceState(null, '', '#' + path);
    } catch (e) { /* history unavailable — the tab still switched */ }
  }
  function init() {
    document.querySelectorAll(TABS).forEach(function (t) {
      t.addEventListener('click', function () { show(t.getAttribute('data-studio-tab')); });
    });
    var fromHash = (location.hash || '').replace('#', '');
    show(fromHash || 'record');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  window.StudioPaths = { show: show };
})();
