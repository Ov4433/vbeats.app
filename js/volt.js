/* Volt — the site guide. Floating button + narrated page tours. */
(function () {
  const PAGE = location.pathname.split('/').pop() || 'index.html';

  const TOURS = {
    'index.html': [
      { sel: '.hero-banner', text: "Welcome to <b>Verified Beats Studio</b>. I'm <b>Volt</b> — night-shift manager. Let me show you around." },
      { sel: '.feats', text: "Every beat here is <b>fingerprinted and verified on-chain</b>. No fakes get past me." },
      { sel: '.mascot-band', text: "That's me. I check every upload before it hits the marketplace." },
      { sel: '#latest', text: "Fresh drops land here. Hit play, or open one to see its verification receipt." },
      { sel: '.hero-cta', text: "Ready? Browse the beats, or jump in the studio and record your own. Tour over — go make noise. 🦇" },
    ],
    'marketplace.html': [
      { sel: '#q', text: "The vault. Search by name, filter by genre — find your next sound." },
      { sel: '#grid', text: "Every card is a <b>verified</b> beat. Hit play for a preview." },
      { sel: '#more-wrap', text: "Keep digging — there's always more heat below." },
    ],
    'upload.html': [
      { sel: '#auth-card', text: "First: sign in. Your uploads live under your name." },
      { sel: '#audio', text: "Drop your audio here — <b>I fingerprint it the second it lands.</b>" },
      { sel: '#bpm', text: "Fill in the details — title, genre, BPM, price. Then publish and it's live." },
    ],
    'studio.html': [
      { sel: '#lamp', text: "This is the booth. Hit record and lay it down — I'll keep time." },
      { sel: '#meterfill', text: "Watch your levels. I like it hot, not clipping." },
      { sel: '#pub-card', text: "Name it, price it, publish it. I fingerprint it on the way out. 🦇" },
    ],
    'chat.html': [
      { sel: '#box', text: "The Booth — where producers talk shop, collabs, and drops." },
      { sel: '#composer', text: "Sign in and say hi. Keep it about the music — <b>I bite spammers.</b>" },
    ],
  };

  const LINKS = [
    ['marketplace.html', 'Marketplace'],
    ['studio.html', 'Studio'],
    ['upload.html', 'Upload'],
    ['chat.html', 'Chat'],
  ];

  function el(tag, cls, html) {
    const d = document.createElement(tag);
    if (cls) d.className = cls;
    if (html != null) d.innerHTML = html;
    return d;
  }

  /* ---------- floating guide button ---------- */
  const fab = el('button', 'volt-fab', '<img src="assets/mascot-profile.webp" alt="Volt">');
  fab.title = 'Volt — site guide';
  fab.setAttribute('aria-label', 'Open Volt, the site guide');
  const panel = el('div', 'volt-panel');
  panel.style.display = 'none';
  document.body.appendChild(fab);
  document.body.appendChild(panel);

  function renderPanel() {
    const hasTour = !!TOURS[PAGE];
    panel.innerHTML =
      '<div class="volt-panel-head"><img src="assets/mascot-profile.webp" alt="">' +
      '<div><b>Volt here.</b><br><span>Night-shift manager. How can I help?</span></div></div>' +
      (hasTour ? '<button class="btn small volt-tour-btn">Take the page tour</button>' : '') +
      '<div class="volt-links">' +
      LINKS.map(([h, t]) => `<a href="${h}">${t}</a>`).join('') +
      '</div>';
    const tb = panel.querySelector('.volt-tour-btn');
    if (tb) tb.onclick = () => { panel.style.display = 'none'; startTour(TOURS[PAGE]); };
  }
  renderPanel();
  fab.onclick = () => {
    panel.style.display = panel.style.display === 'none' ? '' : 'none';
  };

  /* ---------- tour engine ---------- */
  let dim, spot, card, stepIdx, steps;

  function startTour(s) {
    steps = s.filter(st => document.querySelector(st.sel));
    if (!steps.length) return;
    dim = el('div', 'volt-dim');
    spot = el('div', 'volt-spot');
    card = el('div', 'volt-card');
    document.body.append(dim, spot, card);
    stepIdx = -1;
    next();
    document.addEventListener('keydown', esc);
  }
  function esc(e) { if (e.key === 'Escape') end(); }
  function end() {
    [dim, spot, card].forEach(x => x && x.remove());
    document.removeEventListener('keydown', esc);
    try { localStorage.setItem('volt-tour-' + PAGE, '1'); } catch {}
  }
  function next() {
    stepIdx++;
    if (stepIdx >= steps.length) return end();
    const t = document.querySelector(steps[stepIdx].sel);
    t.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setTimeout(() => show(t), 350);
  }
  function show(t) {
    const r = t.getBoundingClientRect();
    const pad = 8;
    spot.style.left = (r.left - pad + scrollX) + 'px';
    spot.style.top = (r.top - pad + scrollY) + 'px';
    spot.style.width = (r.width + pad * 2) + 'px';
    spot.style.height = (r.height + pad * 2) + 'px';
    card.innerHTML =
      '<img src="assets/mascot-profile.webp" alt="">' +
      `<div class="volt-card-text">${steps[stepIdx].text}</div>` +
      `<div class="volt-card-foot"><span>Step ${stepIdx + 1} of ${steps.length}</span>` +
      '<span>' +
      (stepIdx > 0 ? '<button class="btn small ghost volt-back">Back</button> ' : '') +
      (stepIdx < steps.length - 1
        ? '<button class="btn small volt-next">Next</button> '
        : '<button class="btn small volt-next">Finish</button> ') +
      '<button class="btn small ghost volt-skip">Skip</button>' +
      '</span></div>';
    card.style.visibility = 'hidden';
    card.style.left = '0px'; card.style.top = '0px';
    // measure then place
    const cw = Math.min(320, innerWidth - 32);
    card.style.width = cw + 'px';
    const ch = card.offsetHeight;
    let left = Math.max(16, Math.min(r.left + scrollX, innerWidth - cw - 16));
    let top = r.bottom + scrollY + 16;
    if (top + ch > scrollY + innerHeight - 16) top = r.top + scrollY - ch - 16;
    if (top < scrollY + 16) top = scrollY + 16;
    card.style.left = left + 'px';
    card.style.top = top + 'px';
    card.style.visibility = '';
    card.querySelector('.volt-next').onclick = next;
    card.querySelector('.volt-skip').onclick = end;
    const back = card.querySelector('.volt-back');
    if (back) back.onclick = () => { stepIdx -= 2; next(); };
  }

  /* ---------- first-visit: stay quiet. Volt never pops up on his own.
     He only appears when tapped, or when he sees trouble (Volt.help). ---------- */

  /* ---------- quiet help toast: Volt speaks up only when something breaks ---------- */
  let toastTimer = null;
  function help(html) {
    let t = document.querySelector('.volt-toast');
    if (!t) {
      t = el('div', 'volt-toast',
        '<img src="assets/mascot-profile.webp" alt=""><div class="volt-toast-text"></div>');
      document.body.appendChild(t);
      t.onclick = () => t.remove();
    }
    t.querySelector('.volt-toast-text').innerHTML = '<b>Volt:</b> ' + html;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 9000);
  }

  window.Volt = { startTour: (p) => startTour(TOURS[p || PAGE] || []), help };
})();
