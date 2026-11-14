/* Unified VBeats flow — best of ChatGPT + Grok + Claude, in one place.
   Shared helpers so every page renders the same beat card, the same price,
   the same honest badge, the same sign-in modal and the same sticky player.
   Branding stays locked: purple/pink neon + gold-on-black. No SafeLock
   detection, no Distribution system, no guest checkout, no new license
   tiers — those were invented by ChatGPT and do not exist here.
   Honesty notes (do not "fix" by inventing data):
   - Feed badges start fingerprint-based. Per-card on-chain proof is
     checked LAZILY as cards scroll into view (verifyCards, via the
     backend /verify-batch endpoint, cached per beat) — never a hardcoded
     verified badge, and the feed never blocks on chain calls.
   - Trending is lifetime plays + votes UNLESS the backend returned a
     `week` field (?window=7d): then it is real 7-day plays + votes and
     is labelled "Trending this week". Lifetime data is never labelled
     "this week".
   - There IS a real direct-buy path: BeatNFT.buy(), Hardhat-tested, but
     only when the producer set a price AND stocked licenses. The buy
     panel reads that listing state first; when nothing is listed it
     says so and offers the offer flow instead. */
(function () {
  var BASESCAN = 'https://basescan.org';
  var CHAIN_ID = window.VBEATS_CHAIN_ID || 8453;

  /* ---------- price: ETH primary, USD secondary (live rate, fail silent) --- */
  var ethUsd = null, ethUsdAt = 0;
  function fetchEthUsd() {
    if (ethUsd && Date.now() - ethUsdAt < 10 * 60 * 1000) return Promise.resolve(ethUsd);
    return fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var v = d && d.ethereum && d.ethereum.usd;
        if (v) { ethUsd = v; ethUsdAt = Date.now(); }
        return ethUsd;
      }).catch(function () { return ethUsd; });
  }
  function ethPrice(b) {
    var p = Number(b && b.price) || 0;
    return (p % 1 === 0 ? String(p) : String(p)) + ' ETH';
  }
  function priceHtml(b) {
    var p = Number(b && b.price) || 0;
    var usd = ethUsd ? (p * ethUsd) : null;
    var usdPart = usd == null ? '' :
      ' <span class="price-usd">&asymp; $' + (usd >= 100 ? Math.round(usd) : usd.toFixed(2)) + '</span>';
    return '<span class="price">' + esc(p) + ' ETH</span>' + usdPart;
  }
  function refreshUsd(scope) {
    fetchEthUsd().then(function () {
      if (!ethUsd) return;
      (scope || document).querySelectorAll('[data-price-eth]').forEach(function (el) {
        var p = Number(el.getAttribute('data-price-eth')) || 0;
        var usd = p * ethUsd;
        var s = el.querySelector('.price-usd');
        if (s) s.innerHTML = '&asymp; $' + (usd >= 100 ? Math.round(usd) : usd.toFixed(2));
      });
    });
  }

  /* ---------- trending: plays + votes (lifetime — see header note) -------- */
  function trendScore(b) {
    var plays = (b.stats && b.stats.plays) || 0;
    var votes = (b.votes && b.votes.totalWeight) || 0;
    return plays + 2 * votes;
  }
  function sortTrending(beats) {
    return (beats || []).slice().sort(function (a, b) { return trendScore(b) - trendScore(a); });
  }

  /* ---------- trending this week: real 7-day plays + votes ----------------
     Only used when the backend returned a `week` field per beat
     (?window=7d). weeklyActiveCount() guards the label: fewer than 3
     beats with any week activity means the week is too thin to call a
     trend, so the caller falls back to lifetime sorting and must NOT
     label it "this week". */
  function weekScore(b) {
    var w = b.week || {};
    return (Number(w.plays) || 0) + 2 * (Number(w.votes) || 0);
  }
  function sortWeekly(beats) {
    return (beats || []).slice().sort(function (a, b) { return weekScore(b) - weekScore(a); });
  }
  function weeklyActiveCount(beats) {
    var n = 0;
    (beats || []).forEach(function (b) { if (weekScore(b) > 0) n++; });
    return n;
  }

  /* ---------- honest verified badge (fingerprint first, chain-checked lazy) */
  function verifyChip(b) {
    if (b && b.fingerprint) {
      return '<span class="chip verify-chip" data-verify-id="' + esc(b.id) + '" title="SHA-256 fingerprint recorded — on-chain status is checked as this card scrolls into view">&check; Fingerprinted</span>';
    }
    return '<span class="chip chip-unverified" title="No fingerprint recorded yet">Not verified yet</span>';
  }

  /* Lazy per-card on-chain proof: IntersectionObserver, cached per beat,
     batched through POST /v1/beats/verify-batch (max 12 ids per call, one
     in-flight batch at a time). Never blocks the feed render. If the
     backend says the chain is not configured, stop observing — there is
     nothing to check, and the fingerprint chip stays as the honest state.
     A failed batch leaves the fingerprint chip alone (no retry loop). */
  var verifyCache = {};
  var verifyQueued = [];
  var verifyInFlight = false;
  var verifyStopped = false;
  function verifyChipEl(id) {
    return document.querySelector('.verify-chip[data-verify-id="' + id + '"]');
  }
  function applyVerifyResult(id, r) {
    var el = verifyChipEl(id);
    if (!el) return;
    if (!r) return; // leave the fingerprint chip — no invented status
    if (r.configured === false) { verifyStopped = true; return; }
    if (r.onChain) {
      el.innerHTML = '&check; Verified on-chain';
      el.title = 'Fingerprint is registered in the BeatRegistry contract — tap the beat for the full receipt';
      el.classList.add('chip-verified');
    } else {
      el.innerHTML = 'Not verified yet';
      el.title = 'Fingerprint recorded, but not registered on-chain yet';
      el.classList.add('chip-unverified');
    }
  }
  function flushVerifyQueue() {
    if (verifyInFlight || !verifyQueued.length || verifyStopped) return;
    verifyInFlight = true;
    var batch = verifyQueued.splice(0, 12);
    api.verifyBatch(batch).then(function (d) {
      if (d && d.chainConfigured === false) verifyStopped = true;
      var results = (d && d.results) || {};
      batch.forEach(function (id) {
        var r = results[id] || null;
        if (r) verifyCache[id] = r;
        applyVerifyResult(id, r);
      });
    }).catch(function () {
      // Leave the fingerprint chips; do not re-queue into a retry loop.
      batch.forEach(function (id) { verifyCache[id] = { failed: true }; });
    }).finally(function () {
      verifyInFlight = false;
      if (verifyQueued.length) setTimeout(flushVerifyQueue, 100);
    });
  }
  function verifyCards(scope) {
    if (verifyStopped) return;
    var els = (scope || document).querySelectorAll('.verify-chip[data-verify-id]');
    if (!els.length) return;
    if (typeof IntersectionObserver === 'undefined') {
      els.forEach(function (el) {
        var id = el.getAttribute('data-verify-id');
        if (id && !verifyCache[id]) { verifyCache[id] = { pending: true }; verifyQueued.push(id); }
      });
      flushVerifyQueue();
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var id = en.target.getAttribute('data-verify-id');
        io.unobserve(en.target);
        if (!id || verifyCache[id]) return;
        verifyCache[id] = { pending: true };
        verifyQueued.push(id);
        flushVerifyQueue();
      });
    }, { rootMargin: '200px' });
    els.forEach(function (el) { io.observe(el); });
  }
  function explorerAddr(a) {
    if (!a) return '';
    return '<a class="mono" href="' + BASESCAN + '/address/' + esc(a) + '" target="_blank" rel="noopener">' + esc(a.slice(0, 6)) + '&hellip;' + esc(a.slice(-4)) + '</a>';
  }
  function explorerTx(h) {
    if (!h) return '';
    return '<a href="' + BASESCAN + '/tx/' + esc(h) + '" target="_blank" rel="noopener">View on Basescan &rarr;</a>';
  }
  function chainExplainerHtml() {
    return '<details class="chain-explainer"><summary>Which chain does what?</summary>' +
      '<p>Beats are fingerprinted and registered on <b>Base</b> (chain ' + CHAIN_ID + '). ' +
      'The <b>Volt Pass</b> also mints on Base. <b>VBEATS</b> trades on <b>Robinhood Chain</b> — bridge ETH there to buy it. ' +
      'Solana shows up only for linked dev.fun creations. If your wallet is on the wrong network, the site will ask you to switch.</p></details>';
  }

  /* ---------- primary CTA (Grok, Nov 13) -----------------------------------
     "Buy now" ONLY when there is a price signal (a listed price > 0),
     otherwise "Make offer". Both deep-link to the beat page, #buy / #offer,
     and beat.html honours the hash (scrolls to the buy panel, or opens
     the offer form). This is a price signal only — it does NOT prove the
     producer stocked licenses on-chain; beat.html still checks the live
     BeatNFT listing first and says so when instant buy is unavailable. */
  function primaryCta(b) {
    var id = b && b.id ? String(b.id) : '';
    var hasPrice = Number(b && b.price) > 0;
    if (hasPrice) {
      return { label: 'Buy now', href: 'beat.html?id=' + encodeURIComponent(id) + '#buy', anchor: 'buy' };
    }
    return { label: 'Make offer', href: 'beat.html?id=' + encodeURIComponent(id) + '#offer', anchor: 'offer' };
  }

  /* ---------- platform fee (money path, Nov 13) ---------------------------
     The fee is NOT set yet (Star's call: add a fee to the contract, accept
     0% on direct buys, or route via escrow). Until then the full listed
     price goes to the producer — this note says exactly that, everywhere
     money moves, and never implies a fee is being taken. */
  function feeNoteHtml() {
    var fee = window.VBEATS_PLATFORM_FEE || { bps: 0, status: 'undecided' };
    if (fee.status === 'undecided') {
      return 'Platform fee: not set yet — the full listed price goes to the producer. No fee is taken on direct buys until the fee is decided.';
    }
    if (fee.bps > 0) {
      return 'Platform fee: ' + (fee.bps / 100) + '% — the rest of the listed price goes to the producer.';
    }
    return 'Platform fee: 0% on direct buys — the full listed price goes to the producer.';
  }

  /* ---------- Make-a-song (Nov 13) -----------------------------------------
     A song is a vocal take over a parent beat. In the feed it reads
     "🎤 Song · over [beat title]" with the parent linked — never just
     another beat card. A pending song (awaiting the parent producer's
     co-sign) is labelled honestly and never gets a buy button. */
  function isSong(b) { return b && (b.kind === 'song'); }
  function songOverLabel(b) {
    var parent = (b && b.parentBeat && b.parentBeat.title) || '';
    return parent ? '🎤 Song · over ' + parent : '🎤 Song';
  }
  function songCta(b) {
    var parentId = (b && b.parentBeatId) || (b && b.parentBeat && b.parentBeat.id) || '';
    return { label: '🎤 Rap on this', href: 'make.html?beat=' + encodeURIComponent(parentId || b.id) };
  }
  function coSignChip(b) {
    if (!isSong(b)) return '';
    if (b.coSignStatus === 'pending') return ' <span class="badge wait">Awaiting producer co-sign</span>';
    if (b.coSignStatus === 'rejected') return ' <span class="badge no">Not co-signed</span>';
    // Live through an accepted feature request: badge the producer who
    // co-signed it. Live without an accepted request (own beat) gets no
    // badge — the co-signer is only shown when the backend really has one.
    if (b.coSignedBy && b.coSignedBy.username) {
      return ' <span class="badge ok">✓ Co-signed by ' + esc(b.coSignedBy.username) + '</span>';
    }
    return '';
  }

  /* ---------- share (money path, Nov 13) -----------------------------------
     Share a beat or a song: song + parent beat + fingerprint, linked to
     the REAL beat/song URL — never a fake short link. Uses the native
     share sheet when the browser has one, otherwise copies the link. */
  function shareBeat(b) {
    var url = location.origin + location.pathname.replace(/[^/]*$/, '') +
      'beat.html?id=' + encodeURIComponent(b.id);
    var parent = (b && b.parentBeat && b.parentBeat.title) || '';
    var text = isSong(b)
      ? '🎤 ' + b.title + ' — a song over "' + parent + '" on Verified Beats Studio'
      : '🎧 ' + b.title + ' — a verified beat on Verified Beats Studio';
    if (b.fingerprint) text += ' · fingerprint ' + b.fingerprint.slice(0, 10) + '…';
    if (navigator.share) {
      return navigator.share({ title: b.title, text: text, url: url })
        .then(function () { return 'Shared.'; })
        .catch(function (e) { if (e && e.name === 'AbortError') return 'Share cancelled.'; throw e; });
    }
    return navigator.clipboard.writeText(url).then(function () {
      return 'Link copied — ' + url;
    }).catch(function () {
      return 'Copy failed — long-press this link instead: ' + url;
    });
  }

  /* ---------- unified beat card (same everywhere) -------------------------- */
  function beatCard(b, opts) {
    opts = opts || {};
    var art = esc(api.artUrl(b));
    var meta = esc(b.genre) + (b.bpm ? ' &middot; ' + esc(b.bpm) + ' BPM' : '') +
      ((b.duration || b.dur) ? ' &middot; ' + fmtDur(b.duration || b.dur) : '');
    var votes = (b.votes && b.votes.totalWeight) || 0;
    var cta = isSong(b) ? songCta(b) : primaryCta(b);
    var titleHtml = isSong(b)
      ? esc(songOverLabel(b)) + ' — ' + esc(b.title)
      : esc(b.title);
    return '<article class="post" data-beat-id="' + esc(b.id) + '">' +
      '<div class="post-head"><img src="' + art + '" alt="">' +
      '<div><div class="who">' + titleHtml + (b.isHouse ? ' <span class="house-tag">&#127968; House beat</span>' : '') + coSignChip(b) + '</div>' +
      '<div class="sub">' + meta + '</div></div>' + verifyChip(b) + '</div>' +
      '<img class="post-art" src="' + art + '" alt="" loading="lazy" onclick="location.href=\'beat.html?id=' + esc(b.id) + '\'">' +
      '<div class="post-body"><div class="post-actions">' +
      '<button class="play-btn" data-play-id="' + esc(b.id) + '" data-play-url="' + esc(api.mediaUrl(b)) + '" data-play-title="' + esc(b.title) + '" aria-label="Play preview">&#9654;</button>' +
      '<button class="btn small ghost vote-btn' + (b.votedByMe ? ' voted' : '') + '" data-vote-id="' + esc(b.id) + '" aria-label="Vote for this beat">&Delta; <span class="vote-count">' + esc(votes) + '</span></button>' +
      '<span data-price-eth="' + esc(Number(b.price) || 0) + '">' + priceHtml(b) + '</span>' +
      '<a class="btn small" href="' + esc(cta.href) + '">' + esc(cta.label) + '</a>' +
      '<button class="btn small ghost card-menu-btn" data-menu-id="' + esc(b.id) + '" aria-label="More actions">&hellip;</button>' +
      '</div>' +
      '<div class="card-menu" id="menu-' + esc(b.id) + '" style="display:none">' +
      '<a href="creator.html?u=' + esc(b.userId) + '">Producer</a>' +
      '<a href="studio.html">Remix</a>' +
      (isSong(b) ? '' : '<a href="make.html?beat=' + esc(b.id) + '">🎤 Rap on this</a>') +
      '<a href="beat.html?id=' + esc(b.id) + '">View on-chain receipt</a>' +
      '<a href="#" data-share-beat="' + esc(b.id) + '" data-share-title="' + esc(b.title) + '"' +
      ' data-share-parent="' + esc((b.parentBeat && b.parentBeat.title) || '') + '"' +
      ' data-share-fp="' + esc(b.fingerprint || '') + '"' +
      ' data-share-kind="' + esc(b.kind || 'beat') + '">Share</a>' +
      '</div></div></article>';
  }
  function wireCardMenus(scope) {
    (scope || document).querySelectorAll('.card-menu-btn').forEach(function (btn) {
      btn.onclick = function (e) {
        e.stopPropagation();
        var m = document.getElementById('menu-' + btn.getAttribute('data-menu-id'));
        if (m) m.style.display = m.style.display === 'none' ? '' : 'none';
      };
    });
    // Share links in card menus: real beat URL, native sheet or copy.
    (scope || document).querySelectorAll('[data-share-beat]').forEach(function (a) {
      a.onclick = function (e) {
        e.preventDefault();
        var parentTitle = a.getAttribute('data-share-parent') || '';
        shareBeat({
          id: a.getAttribute('data-share-beat'),
          title: a.getAttribute('data-share-title') || '',
          kind: a.getAttribute('data-share-kind') || 'beat',
          fingerprint: a.getAttribute('data-share-fp') || '',
          parentBeat: parentTitle ? { title: parentTitle } : null,
        })
          .then(function (msg) { if (window.Volt) Volt.help(msg); })
          .catch(function () { if (window.Volt) Volt.help('Share failed — copy the beat link from the address bar instead.'); });
      };
    });
    document.addEventListener('click', function () {
      document.querySelectorAll('.card-menu').forEach(function (m) { m.style.display = 'none'; });
    });
  }

  /* ---------- generic modal (sign-in + offers share it) -------------------- */
  function closeModal() {
    var m = document.getElementById('flow-modal');
    if (m) m.remove();
  }
  function openModal(html) {
    closeModal();
    var m = document.createElement('div');
    m.id = 'flow-modal'; m.className = 'flow-modal';
    m.innerHTML = '<div class="flow-modal-card">' + html + '</div>';
    m.addEventListener('click', function (e) { if (e.target === m) closeModal(); });
    document.body.appendChild(m);
    return m;
  }
  function signInModal(reason) {
    var m = openModal(
      '<h3>Sign in to ' + esc(reason || 'continue') + '</h3>' +
      '<p class="note">Your wallet is your identity here. Email sign-in is the fallback for uploads — your pass, your bat and your uploads all follow your wallet.</p>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">' +
      '<button class="btn" id="flow-connect">Connect wallet</button>' +
      '<button class="btn ghost" id="flow-email">Sign in with email</button>' +
      '<button class="btn ghost" id="flow-close">Not now</button></div>' +
      '<p class="note" style="margin-top:12px">You can keep browsing without signing in — we only ask when you act.</p>');
    m.querySelector('#flow-close').onclick = closeModal;
    m.querySelector('#flow-email').onclick = function () {
      try { sessionStorage.setItem('vbeats_return', location.href); } catch (e) {}
      location.href = 'upload.html';
    };
    m.querySelector('#flow-connect').onclick = async function () {
      try {
        await api.connectWallet();
        closeModal();
        if (window.renderUser) renderUser();
        if (window.Flow) Flow.refreshWalletChip();
        location.reload();
      } catch (e) { Volt.help(e.message || String(e)); }
    };
  }
  function requireAuth(reason, fn) {
    if (api.loggedIn() || api.wallet) return fn();
    signInModal(reason);
  }

  /* ---------- post-action next-step card ----------------------------------- */
  function nextSteps(el, cfg) {
    if (!el) return;
    el.innerHTML = '<div class="next-steps"><b>' + esc(cfg.title) + '</b>' +
      (cfg.text ? '<p class="note">' + esc(cfg.text) + '</p>' : '') +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">' +
      (cfg.actions || []).map(function (a) {
        return '<a class="btn small' + (a.ghost ? ' ghost' : '') + '" href="' + esc(a.href) + '">' + esc(a.label) + '</a>';
      }).join('') + '</div></div>';
  }

  /* ---------- transaction status tray -------------------------------------- */
  function txTray() {
    var t = document.getElementById('flow-tx-tray');
    if (t) return t;
    t = document.createElement('div');
    t.id = 'flow-tx-tray'; t.className = 'flow-tx-tray'; t.style.display = 'none';
    document.body.appendChild(t);
    return t;
  }
  function txPending(label) {
    var t = txTray();
    t.style.display = '';
    t.innerHTML = '<span class="tx-dot"></span> ' + esc(label) + ' — waiting for confirmation&hellip;';
  }
  function txConfirmed(label, hash) {
    var t = txTray();
    t.style.display = '';
    t.innerHTML = '<b>&check; ' + esc(label) + '</b> &nbsp;' + explorerTx(hash) +
      ' <button class="btn ghost small" onclick="document.getElementById(\'flow-tx-tray\').style.display=\'none\'">Dismiss</button>';
    setTimeout(function () { t.style.display = 'none'; }, 20000);
  }

  /* ---------- global sticky audio player (one Audio for the whole site) ---- */
  var playerAudio = null, playerTitle = '', playerBtn = null;
  function playerBar() {
    var bar = document.getElementById('flow-player');
    if (bar) return bar;
    bar = document.createElement('div');
    bar.id = 'flow-player'; bar.className = 'flow-player'; bar.style.display = 'none';
    bar.innerHTML = '<button class="play-btn" id="flow-player-toggle">&#9654;</button>' +
      '<span class="flow-player-title" id="flow-player-title"></span>' +
      '<button class="btn ghost small" id="flow-player-stop">Stop</button>';
    document.body.appendChild(bar);
    bar.querySelector('#flow-player-toggle').onclick = function () {
      if (!playerAudio) return;
      if (playerAudio.paused) { playerAudio.play(); } else { playerAudio.pause(); }
      syncPlayerBar();
    };
    bar.querySelector('#flow-player-stop').onclick = stopPlayer;
    return bar;
  }
  function syncPlayerBar() {
    var bar = playerBar();
    var t = bar.querySelector('#flow-player-toggle');
    if (t) t.textContent = (playerAudio && !playerAudio.paused) ? '\u23F8' : '\u25B6';
  }
  function stopPlayer() {
    if (playerAudio) { playerAudio.pause(); playerAudio = null; }
    if (playerBtn) { playerBtn.classList.remove('playing'); playerBtn.textContent = '\u25B6'; playerBtn = null; }
    var bar = document.getElementById('flow-player');
    if (bar) bar.style.display = 'none';
  }
  function play(url, title, btn) {
    if (!url) return;
    if (playerAudio && playerAudio.dataset.url === url && !playerAudio.paused) { stopPlayer(); return; }
    stopPlayer();
    playerAudio = new Audio(url); playerAudio.dataset.url = url;
    playerAudio.play().catch(function () {});
    playerBtn = btn || null;
    if (playerBtn) { playerBtn.classList.add('playing'); playerBtn.textContent = '\u23F8'; }
    var bar = playerBar();
    bar.style.display = '';
    var t = bar.querySelector('#flow-player-title');
    if (t) t.textContent = title || 'Playing…';
    syncPlayerBar();
    playerAudio.onended = stopPlayer;
    playerAudio.onpause = syncPlayerBar;
    playerAudio.onplay = syncPlayerBar;
  }

  /* ---------- skeleton + retry (free-tier cold start) ----------------------- */
  function skeletonHtml(n) {
    var out = '';
    for (var i = 0; i < (n || 3); i++) out += '<div class="skeleton-card"><div class="skeleton-line sk-title"></div><div class="skeleton-line sk-sub"></div><div class="skeleton-line sk-art"></div></div>';
    return out;
  }
  function fetchWithRetry(fn, tries, delayMs) {
    tries = tries || 3; delayMs = delayMs || 1500;
    return fn().catch(function (e) {
      if (tries <= 1) throw e;
      return new Promise(function (res) { setTimeout(res, delayMs); })
        .then(function () { return fetchWithRetry(fn, tries - 1, delayMs * 2); });
    });
  }
  function coldStartHtml() {
    return '<p class="note" style="text-align:center;padding:24px">The marketplace is waking up (free tier cold start). ' +
      'It usually takes a few seconds — <button class="btn small ghost" onclick="location.reload()">Try again</button> ' +
      'or <a href="studio.html" style="color:var(--pur)">open the studio</a> while you wait.</p>';
  }

  /* ---------- wallet chip / chain pill (nav) -------------------------------- */
  function walletChipHtml() {
    var w = api.wallet;
    var bat = api.bat ? batById(api.bat) : null;
    if (!w) return '<button class="btn small" id="wallet-btn">Connect wallet</button>';
    var dot = bat ? '<span class="bat-dot" style="background:' + bat.color + ';width:22px;height:22px;font-size:11px;margin:0 4px 0 0;vertical-align:-6px">' + bat.name[0] + '</span>' : '';
    return dot + '<button class="btn ghost small" id="wallet-btn" title="' + esc(w) + ' — tap to disconnect">' + esc(w.slice(0, 6)) + '&hellip;' + esc(w.slice(-4)) + '</button>';
  }
  function refreshWalletChip() {
    var box = document.getElementById('nav-user');
    if (box && window.renderUser) renderUser();
  }

  /* ---------- pass progress (shown even at 2–3 VBEATS) ---------------------- */
  function passProgressHtml(balance, threshold) {
    threshold = threshold || 10;
    var pct = Math.min(100, Math.round(((Number(balance) || 0) / threshold) * 100));
    return '<div class="pass-progress"><div class="pass-progress-bar"><div style="width:' + pct + '%"></div></div>' +
      '<p class="note">' + esc(balance == null ? '—' : balance) + ' / ' + threshold + ' VBEATS — ' +
      (pct >= 100 ? 'ready to claim your Volt Pass' : 'pass unlocks at ' + threshold + ' VBEATS') + '</p></div>';
  }

  window.Flow = {
    ethPrice: ethPrice, priceHtml: priceHtml, refreshUsd: refreshUsd,
    trendScore: trendScore, sortTrending: sortTrending,
    weekScore: weekScore, sortWeekly: sortWeekly, weeklyActiveCount: weeklyActiveCount,
    verifyChip: verifyChip, verifyCards: verifyCards, explorerAddr: explorerAddr, explorerTx: explorerTx,
    chainExplainerHtml: chainExplainerHtml,
    primaryCta: primaryCta, feeNoteHtml: feeNoteHtml, shareBeat: shareBeat,
    isSong: isSong, songOverLabel: songOverLabel, songCta: songCta, coSignChip: coSignChip,
    beatCard: beatCard, wireCardMenus: wireCardMenus,
    openModal: openModal, closeModal: closeModal,
    signInModal: signInModal, requireAuth: requireAuth,
    nextSteps: nextSteps,
    txPending: txPending, txConfirmed: txConfirmed,
    play: play, stopPlayer: stopPlayer,
    skeletonHtml: skeletonHtml, fetchWithRetry: fetchWithRetry, coldStartHtml: coldStartHtml,
    walletChipHtml: walletChipHtml, refreshWalletChip: refreshWalletChip,
    passProgressHtml: passProgressHtml,
    chainId: CHAIN_ID, basescan: BASESCAN,
  };
})();
