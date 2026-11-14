/* Verified Beats Studio — shared API client + nav */
window.VBEATS_API = window.VBEATS_API || 'https://vbeats-api.onrender.com';

// --- Wallet library (ethers) lazy loader ---
// Most pages don't include the ethers script tag, and on some phones /
// networks the CDN is blocked outright — so load it on first use, trying
// each CDN in turn, instead of failing the tap with "library failed".
let _ethersLoading = null;
function ensureEthers() {
  if (typeof ethers !== 'undefined') return Promise.resolve();
  if (_ethersLoading) return _ethersLoading;
  const CDNS = [
    // Self-hosted first: our own origin is never blocked by CDN filters.
    'js/ethers.min.js',
    'https://cdn.jsdelivr.net/npm/ethers@6.13.4/dist/ethers.min.js',
    'https://unpkg.com/ethers@6.13.4/dist/ethers.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/ethers/6.13.4/ethers.umd.min.js',
  ];
  _ethersLoading = (async () => {
    for (const url of CDNS) {
      try {
        await new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = url;
          s.async = true;
          s.onload = resolve;
          s.onerror = reject;
          document.head.appendChild(s);
        });
        if (typeof ethers !== 'undefined') return;
      } catch { /* blocked or slow — try the next CDN */ }
    }
    _ethersLoading = null; // let a later tap retry from scratch
    throw new Error('Wallet library failed to load — your connection is blocking it. Try another network or browser, then tap again.');
  })();
  return _ethersLoading;
}
window.ensureEthers = ensureEthers;

// --- Chain config (Base mainnet). Contract addresses are empty until deploy. ---
window.VBEATS_CHAIN_ID = window.VBEATS_CHAIN_ID || 8453;
window.VBEATS_RPC_URL = window.VBEATS_RPC_URL || 'https://mainnet.base.org';
window.VBEATS_REGISTRY_ADDRESS = window.VBEATS_REGISTRY_ADDRESS || '0x4eFeB94F1FA8fa5D3d30A945D728d85d5FFeC1A7';
window.VBEATS_NFT_ADDRESS = window.VBEATS_NFT_ADDRESS || '0x863A85ee5E542AB126a8a28191f438D4B6E508E0';
window.VBEATS_OFFERS_ADDRESS = window.VBEATS_OFFERS_ADDRESS || '0x64e75daee8eaF13143082A8A04BCA9CF9b3DD848';

// Minimal BeatOffers ABI for the actions the site performs.
// Minimal BeatNFT ABI for the actions the site performs: direct buy.
// buy() is real and Hardhat-tested, but it only works when the producer
// set a price AND stocked licenses — so buyLicense() re-reads the live
// listing price on-chain and refuses (with a plain message) when the beat
// is not listed, instead of sending a transaction that must revert.
// Direct buy pays the producer the full listed price: BeatNFT takes no
// platform fee on this path, and the 10% royalty is EIP-2981 secondary
// only — neither is added to the total shown to the buyer.
//
// --- PLATFORM FEE — NOT SET (Star decision open, Nov 13) -----------------
// The three options are: (a) add a fee to the BeatNFT contract, (b) accept
// 0% on direct buys, (c) route buys through BeatEscrow (which takes a
// fee). Until Star picks one, direct buys pay the producer the FULL listed
// price and the fee stays 0 — this constant is the single hook where the
// chosen fee gets wired in (contract + dashboard copy), so nothing else
// has to change. The dashboard and buy panel both read it and show the
// fee as undecided; nothing here ever implies a fee is being taken.
window.VBEATS_PLATFORM_FEE = { bps: 0, status: 'undecided' };
const BEAT_NFT_ABI = [
  'function buy(bytes32 fingerprint, bool exclusive, uint256 amount) payable',
  'function licensePrice(uint256 tokenId) view returns (uint256)',
  'function leaseTokenId(bytes32 fingerprint) view returns (uint256)',
  'function exclusiveTokenId(bytes32 fingerprint) view returns (uint256)',
  'function balanceOf(address account, uint256 tokenId) view returns (uint256)',
  // Producer listing (money path, Nov 13): setPrice + stockForSale are the
  // two on-chain calls that make a beat buyable. listBeat() below runs
  // them in order; the BeatNFT contract itself is untouched.
  'function setPrice(bytes32 fingerprint, bool exclusive, uint256 priceWei)',
  'function stockForSale(bytes32 fingerprint, bool exclusive, uint256 amount)',
];

const BEAT_OFFERS_ABI = [
  'function makeOffer(address nft, bytes32 fingerprint, bool exclusive, uint256 amount, uint64 durationSeconds) payable returns (uint256)',
  'function makeFinalOffer(address nft, bytes32 fingerprint, bool exclusive, uint256 amount) payable returns (uint256)',
  'function raiseOffer(uint256 offerId) payable',
  'function lowerOffer(uint256 offerId, uint256 newBidWei)',
  'function counterOffer(uint256 offerId, uint256 askPriceWei)',
  'function counterFinal(uint256 offerId, uint256 askPriceWei)',
  'function withdrawAsk(uint256 offerId)',
  'function acceptOffer(uint256 offerId)',
  'function acceptAsk(uint256 offerId) payable',
  'function markBidFinal(uint256 offerId)',
  'function cancelOffer(uint256 offerId)',
  'function rejectOffer(uint256 offerId)',
  'function reclaimExpired(uint256 offerId)',
];

const api = {
  base: window.VBEATS_API,
  get token() { return localStorage.getItem('vbeats_token') || ''; },
  set token(t) { t ? localStorage.setItem('vbeats_token', t) : localStorage.removeItem('vbeats_token'); },

  async req(path, opts = {}) {
    const headers = { ...(opts.headers || {}) };
    if (this.token) headers.Authorization = 'Bearer ' + this.token;
    const res = await fetch(this.base + path, { ...opts, headers });
    let data = null;
    try { data = await res.json(); } catch { /* non-JSON */ }
    if (!res.ok) {
      const msg = (data && (data.error?.message || data.message)) || ('HTTP ' + res.status);
      throw new Error(msg);
    }
    return data;
  },
  get(path) { return this.req(path); },
  post(path, body) {
    return this.req(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  },
  put(path, body) {
    return this.req(path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  },
  profile() { return this.get('/v1/users/profile'); },
  updateProfile(body) { return this.put('/v1/users/profile', body); },
  publicProfile(u) { return this.get('/v1/users/' + encodeURIComponent(u) + '/public'); },

  // --- Home bat (persisted on the profile; mirrored locally for instant render) ---
  get bat() { return localStorage.getItem('vbeats_bat') || ''; },
  set bat(b) { b ? localStorage.setItem('vbeats_bat', b) : localStorage.removeItem('vbeats_bat'); },
  postForm(path, formData) {
    return this.req(path, { method: 'POST', body: formData });
  },

  async signup(email, password, name) {
    const d = await this.post('/v1/auth/signup', { email, password, name });
    if (d.token) this.token = d.token;
    if (d.accessToken) this.token = d.accessToken;
    return d;
  },
  async login(email, password) {
    const d = await this.post('/v1/auth/login', { email, password });
    if (d.token) this.token = d.token;
    if (d.accessToken) this.token = d.accessToken;
    return d;
  },
  logout() { this.token = ''; },
  loggedIn() { return !!this.token; },

  marketplace(params = {}) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== '' && v != null) q.set(k, v);
    return this.get('/v1/beats/marketplace?' + q.toString());
  },
  beat(id) { return this.get('/v1/beats/' + encodeURIComponent(id)); },
  search(q) { return this.get('/v1/beats/search?q=' + encodeURIComponent(q || '')); },
  pendingCoSign() { return this.get('/v1/beats/pending-co-sign'); },
  coSign(id, action) { return this.post('/v1/beats/' + encodeURIComponent(id) + '/co-sign', { action }); },
  // Feature / co-sign requests (Nov 13): singer asks the parent beat's
  // producer to feature the song. 404 = old backend — callers show an
  // honest "needs the latest backend" note, never a fake success.
  requestFeature(songId, message) { return this.post('/v1/features', { songId, message }); },
  featureInbox() { return this.get('/v1/features/inbox'); },
  featureSent() { return this.get('/v1/features/sent'); },
  respondFeature(id, action) { return this.post('/v1/features/' + encodeURIComponent(id) + '/respond', { action }); },
  vote(id) { return this.post('/v1/beats/' + encodeURIComponent(id) + '/vote', {}); },
  topVoted() { return this.get('/v1/beats/top-voted'); },
  verify(id) { return this.post('/v1/beats/' + encodeURIComponent(id) + '/verify', {}); },
  verifyBatch(ids) { return this.post('/v1/beats/verify-batch', { ids }); },
  nft(id) { return this.get('/v1/beats/' + encodeURIComponent(id) + '/nft'); },
  offers(id) { return this.get('/v1/beats/' + encodeURIComponent(id) + '/offers'); },
  // Money path (Nov 13): producer dashboard + purchase receipts.
  // 404 = old backend — callers show an honest "needs the latest
  // backend" note, never invented earnings.
  dashboard() { return this.get('/v1/transactions/dashboard'); },
  myTransactions() { return this.get('/v1/transactions'); },
  recordPurchase(beatId, txHash, amountEth, licenseKind) {
    return this.post('/v1/transactions', { beatId, txHash, amountEth, licenseKind });
  },
  play(id, listenedSec) {
    return this.post('/v1/beats/' + encodeURIComponent(id) + '/play', { listenedSec }).catch(() => null);
  },
  upload(formData) { return this.postForm('/v1/beats/upload', formData); },

  mediaUrl(beat) {
    const u = beat.audioUrl || beat.fileUrl || '';
    if (!u) return '';
    if (/^https?:\/\//.test(u)) return u;
    return this.base + u;
  },
  artUrl(beat) {
    const u = beat.imageUrl || beat.artworkUrl || '';
    if (u && /^https?:\/\//.test(u)) return u;
    return 'assets/logo.png';
  },

  // --- Wallet (MetaMask / any injected EIP-1193 provider) ---
  get wallet() { return localStorage.getItem('vbeats_wallet') || ''; },
  set wallet(a) { a ? localStorage.setItem('vbeats_wallet', a) : localStorage.removeItem('vbeats_wallet'); },

  async connectWallet() {
    if (!window.ethereum) throw new Error('No wallet found — install MetaMask');
    await ensureEthers();
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    if (!accounts || !accounts.length) throw new Error('No accounts authorized');
    await this.ensureBaseChain();
    this.wallet = accounts[0];
    return accounts[0];
  },

  disconnectWallet() { this.wallet = ''; },

  async ensureBaseChain() {
    const chainIdHex = '0x' + Number(window.VBEATS_CHAIN_ID).toString(16);
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain', params: [{ chainId: chainIdHex }],
      });
    } catch (e) {
      if (e && e.code === 4902) {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: chainIdHex, chainName: 'Base',
            nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
            rpcUrls: [window.VBEATS_RPC_URL], blockExplorerUrls: ['https://basescan.org'],
          }],
        });
      } else { throw e; }
    }
  },

  async getSigner() {
    if (!this.wallet) throw new Error('Connect your wallet first');
    if (!window.ethereum) throw new Error('No wallet found');
    await ensureEthers();
    await this.ensureBaseChain();
    return new ethers.BrowserProvider(window.ethereum).getSigner();
  },

  offersContract(signerOrProvider) {
    if (!window.VBEATS_OFFERS_ADDRESS) throw new Error('Offers contract is not deployed yet');
    if (typeof ethers === 'undefined') throw new Error('Wallet library failed to load');
    return new ethers.Contract(window.VBEATS_OFFERS_ADDRESS, BEAT_OFFERS_ABI, signerOrProvider);
  },

  nftContract(signerOrProvider) {
    if (!window.VBEATS_NFT_ADDRESS) throw new Error('NFT contract is not deployed yet');
    if (typeof ethers === 'undefined') throw new Error('Wallet library failed to load');
    return new ethers.Contract(window.VBEATS_NFT_ADDRESS, BEAT_NFT_ABI, signerOrProvider);
  },

  /** Direct buy of a listed license: re-reads the live price + stock from
      the contract, then calls BeatNFT.buy with the exact total. Throws a
      plain message when the beat is not listed for instant buy (the buyer
      should use the offer flow instead). Returns the tx hash. If the
      Base chain itself cannot be reached, it says so plainly — the buyer
      can still make an offer, which does not need the listing read. */
  async buyLicense(fingerprint, exclusive, amount) {
    if (!fingerprint) throw new Error('Beat not loaded yet');
    amount = exclusive ? 1 : Math.max(1, Math.floor(Number(amount) || 1));
    await ensureEthers();
    const provider = new ethers.JsonRpcProvider(window.VBEATS_RPC_URL);
    const read = this.nftContract(provider);
    const fp = this.fpHex(fingerprint);
    let tokenId, price, stock;
    try {
      tokenId = await read.licenseTokenId(fp, exclusive);
      [price, stock] = await Promise.all([
        read.licensePrice(tokenId),
        read.balanceOf(window.VBEATS_NFT_ADDRESS, tokenId),
      ]);
    } catch (e) {
      throw new Error('Base chain is unreachable right now — the listing could not be checked. You can still make an offer below, or retry in a minute.');
    }
    if (price <= 0n) throw new Error('This beat is not listed for instant buy — the producer has not set a price yet. Make an offer instead.');
    if (stock < BigInt(amount)) throw new Error('Not enough licenses in stock for instant buy — make an offer instead.');
    const total = price * BigInt(amount);
    const signer = await this.getSigner();
    const c = this.nftContract(signer);
    const tx = await c.buy(fp, exclusive, amount, { value: total });
    if (window.Flow) Flow.txPending('Buying your license');
    await tx.wait();
    if (window.Flow) Flow.txConfirmed('License bought', tx.hash);
    return tx.hash;
  },

  /** Producer listing (money path, Nov 13): set a price AND stock
      licenses on the BeatNFT contract, so the beat becomes instantly
      buyable. Two transactions per license type (setPrice, then
      stockForSale), in order — a price with no stock still cannot be
      bought. Pass { leasePriceEth, leaseStock, exclusivePriceEth };
      any type left out is left alone. Returns the tx hashes. The
      contract is not changed by this — it only calls the functions the
      producer already owns. */
  async listBeat(fingerprint, opts = {}) {
    if (!fingerprint) throw new Error('Beat not loaded yet');
    const fp = this.fpHex(fingerprint);
    const signer = await this.getSigner();
    const c = this.nftContract(signer);
    const hashes = [];
    const listOne = async (exclusive, priceEth, stock) => {
      const priceWei = ethers.parseEther(String(priceEth));
      if (window.Flow) Flow.txPending(exclusive ? 'Setting exclusive price' : 'Setting lease price');
      const t1 = await c.setPrice(fp, exclusive, priceWei);
      await t1.wait();
      hashes.push(t1.hash);
      if (window.Flow) Flow.txPending(exclusive ? 'Stocking the exclusive' : 'Stocking leases');
      const t2 = await c.stockForSale(fp, exclusive, Math.max(1, Math.floor(Number(stock) || 1)));
      await t2.wait();
      hashes.push(t2.hash);
      if (window.Flow) Flow.txConfirmed(exclusive ? 'Exclusive listed' : 'Leases listed', t2.hash);
    };
    if (opts.leasePriceEth != null && Number(opts.leasePriceEth) > 0) {
      await listOne(false, opts.leasePriceEth, opts.leaseStock || 1);
    }
    if (opts.exclusivePriceEth != null && Number(opts.exclusivePriceEth) > 0) {
      await listOne(true, opts.exclusivePriceEth, 1);
    }
    if (!hashes.length) throw new Error('Enter a lease price or an exclusive price to list.');
    return hashes;
  },

  /** On-chain producer (beat owner) for a fingerprint, via the registry. */
  async producerOf(fingerprint) {
    if (!window.VBEATS_REGISTRY_ADDRESS || !fingerprint) return null;
    await ensureEthers();
    try {
      const provider = new ethers.JsonRpcProvider(window.VBEATS_RPC_URL);
      const reg = new ethers.Contract(
        window.VBEATS_REGISTRY_ADDRESS,
        ['function getBeat(bytes32) view returns (address owner, uint256 timestamp, string metadataURI)'],
        provider
      );
      const fp = fingerprint.startsWith('0x') ? fingerprint : '0x' + fingerprint;
      return (await reg.getBeat(fp)).owner;
    } catch { return null; }
  },

  fpHex(fingerprint) {
    return fingerprint.startsWith('0x') ? fingerprint : '0x' + fingerprint;
  },

  /** Send an offer-contract transaction and wait for it to mine. */
  async offerTx(method, args, valueWei) {
    const signer = await this.getSigner();
    const c = this.offersContract(signer);
    const overrides = valueWei ? { value: valueWei } : {};
    const tx = await c[method](...args, overrides);
    if (window.Flow) Flow.txPending('Offer sent');
    await tx.wait();
    if (window.Flow) Flow.txConfirmed('Offer confirmed on-chain', tx.hash);
    return tx.hash;
  },
};

/* The V Team — both job layers, always: the original crew job and the
   home lane from the bat pick. Colors match the claim page picker. */
const VB_BATS = [
  { id: 'volt',  name: 'Volt',  color: '#c77dff', home: 'Producer', job: 'Onchain Producer',
    homeBlurb: 'Beat maker first. The studio is home.',
    welcome: 'Your studio\u2019s up top.' },
  { id: 'forte', name: 'Forte', color: '#ffd166', home: 'Artist', job: 'OG Whale',
    homeBlurb: 'Vocal booth first. Beats to rap on.',
    welcome: 'Booth\u2019s up top \u2014 beats ready when you are.' },
  { id: 'bass',  name: 'Bass',  color: '#6ec1ff', home: 'Onchain', job: 'Core Dev',
    homeBlurb: 'Verified drops, charts, onchain first.',
    welcome: 'Verified drops up top. Receipts checked.' },
  { id: 'gwei',  name: 'Gwei',  color: '#7dff8a', home: 'Trader', job: 'Retail Trader',
    homeBlurb: 'Marketplace first. Exclusives, staking, vaults.',
    welcome: 'Market\u2019s up top. Move fast.' },
];
function batById(id) { return VB_BATS.find(b => b.id === id) || null; }

/* Bat picker — same UI as the claim page (.bat-grid / .bat-pick), showing
   BOTH job titles. onPick(batId) fires on tap; selection is re-rendered
   by the caller or via wireBatPicker's internal state. */
function batPickerHtml(selected) {
  return '<div class="bat-grid">' + VB_BATS.map(b =>
    '<button type="button" class="bat-pick' + (selected === b.id ? ' on' : '') + '" data-bat="' + b.id + '">' +
    '<span class="bat-dot" style="background:' + b.color + '">' + b.name[0] + '</span><br>' +
    '<b>' + b.name + '</b> · ' + b.home + ' home<br>' +
    '<span class="note">' + b.job + ' \u00b7 ' + b.homeBlurb + '</span></button>'
  ).join('') + '</div>';
}
function wireBatPicker(box, selected, onPick) {
  box.innerHTML = batPickerHtml(selected);
  box.querySelectorAll('.bat-pick').forEach(el => {
    el.onclick = () => {
      box.querySelectorAll('.bat-pick').forEach(x => x.classList.toggle('on', x === el));
      onPick(el.dataset.bat);
    };
  });
}

/* Solana creations — known, static data for a linked dev.fun wallet
   (rubin.beats + its ViBe token). Built from the wallet-link signature
   proof + known IDs only; dev.fun profile pages are never scraped. */
const VB_DEVFUN_APP_URL = 'https://dev.fun/p/a4d1042f917493dc7d04';
const VB_VIBE_MINT = 'ENQpuwEztYuLRvLJdaB9awNrMGH83Njnik4CmPepump';
function solanaCreationsHtml(address) {
  const short = address.slice(0, 4) + '\u2026' + address.slice(-4);
  return '<div style="display:flex;flex-direction:column;gap:10px">' +
    '<p class="note">Linked Solana wallet: <span class="mono">' + esc(address) + '</span></p>' +
    '<p>\u{1F3B9} <a href="' + VB_DEVFUN_APP_URL + '" target="_blank" rel="noopener"><b>rubin.beats</b></a>' +
    ' <span class="note">\u2014 a beat-maker built on dev.fun by this wallet (' + esc(short) + ')</span></p>' +
    '<p><span class="solana-chip">ViBe \u00b7 ' + esc(VB_VIBE_MINT.slice(0, 6)) + '\u2026' + esc(VB_VIBE_MINT.slice(-4)) + '</span> ' +
    '<a class="btn small ghost" href="https://pump.fun/coin/' + VB_VIBE_MINT + '" target="_blank" rel="noopener">View token</a> ' +
    '<a class="btn small ghost" href="https://dev.fun/user/' + encodeURIComponent(address) + '" target="_blank" rel="noopener">dev.fun profile</a></p>' +
    '</div>';
}

function nav(active) {
  // Unified nav (Grok flow + Claude 4-destination cut): Explore, Create,
  // Collect, Profile. Live / Chat / Upload / Console are demoted — still
  // reachable by direct link, but they no longer compete on first visit.
  // Console is developer tooling; regular users should never see it.
  const links = [
    ['index.html', 'Explore'], ['studio.html', 'Create'], ['make.html', 'Make'],
    ['cards.html', 'Collect'], ['profile.html', 'Profile'],
  ];
  const el = document.getElementById('nav');
  el.innerHTML =
    '<div class="nav-in">' +
    '<a class="brand" href="index.html"><img src="assets/logo.png" alt="logo"><span>Verified Beats Studio</span></a>' +
    '<div class="nav-links">' +
    links.map(([h, t]) => `<a href="${h}" class="${h === active ? 'on' : ''}">${t}</a>`).join('') +
    '</div><span class="chain-pill" title="Beats register on Base. VBEATS trades on Robinhood Chain — see the chain explainer at the bottom of the page.">Base</span><div class="nav-right" id="nav-user"></div></div>';
  renderUser();
  tabbar(active);
  // Help Center + SafeLock links on every page footer (one place, so no
  // page can drift out of date). Skip if a page already added them.
  document.querySelectorAll('.footer').forEach(f => {
    if (f.querySelector('[data-foot-links]')) return;
    const d = document.createElement('div');
    d.setAttribute('data-foot-links', '');
    d.style.marginTop = '8px';
    d.innerHTML = '<a href="help.html">Help Center</a> &middot; <a href="safelock.html">SafeLock</a>';
    f.appendChild(d);
  });
}

// App-format bottom tab bar (Rapchat-style): Home / Explore / big red
// Record / Cards / Profile. Injected on every page that builds the nav,
// except the deploy console.
function tabbar(active) {
  if (/deploy\.html$/.test(location.pathname)) return;
  if (document.querySelector('.tabbar')) return;
  const on = {
    'index.html': 'index.html',
    'marketplace.html': 'marketplace.html',
    'studio.html': 'studio.html',
    'upload.html': 'studio.html',
    'cards.html': 'cards.html',
    'beat.html': 'cards.html',
    'claim.html': 'cards.html',
    'profile.html': 'profile.html',
    'creator.html': 'profile.html',
  }[active] || '';
  const ico = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9.5 21v-6h5v6"/></svg>',
    explore: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9.2"/><polygon points="15.5 8.5 13.8 13.8 8.5 15.5 10.2 10.2" fill="currentColor" stroke="none"/></svg>',
    cards: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="13" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/></svg>',
    profile: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c1.4-3.4 4.2-5 7.5-5s6.1 1.6 7.5 5"/></svg>',
  };
  const tab = (href, label, svg) =>
    `<a href="${href}" class="${on === href ? 'on' : ''}">${svg}<span>${label}</span></a>`;
  const bar = document.createElement('div');
  bar.className = 'tabbar';
  bar.innerHTML =
    tab('index.html', 'Home', ico.home) +
    tab('marketplace.html', 'Explore', ico.explore) +
    `<a href="studio.html" class="tab-rec ${on === 'studio.html' ? 'on' : ''}"><span class="rec-btn"><i></i></span><small>Record</small></a>` +
    tab('cards.html', 'Cards', ico.cards) +
    tab('profile.html', 'Profile', ico.profile);
  document.body.appendChild(bar);
  document.body.classList.add('has-tabbar');
}

function renderUser() {
  const box = document.getElementById('nav-user');
  if (!box) return;
  let html = '';
  if (api.loggedIn()) {
    html += '<span>Signed in</span> <button class="btn ghost small" id="logout">Log out</button>';
  } else {
    // Sign-in opens the modal (returns you to where you were) instead of
    // dumping you on the upload page — the old vote confirm() did that.
    html += '<button class="btn ghost small" id="signin-btn">Sign in</button>';
  }
  // Persistent wallet chip: truncated address + bat avatar once claimed.
  const w = api.wallet;
  if (w) {
    const bat = api.bat ? batById(api.bat) : null;
    const dot = bat ? `<span class="bat-dot" style="background:${bat.color};width:22px;height:22px;font-size:11px;margin:0 4px 0 0;vertical-align:-6px">${bat.name[0]}</span>` : '';
    html += ` ${dot}<button class="btn ghost small" id="wallet-btn" title="${esc(w)} — tap to disconnect">${esc(w.slice(0, 6))}…${esc(w.slice(-4))}</button>`;
  } else {
    html += ' <button class="btn small" id="wallet-btn">Connect wallet</button>';
  }
  box.innerHTML = html;
  const lo = document.getElementById('logout');
  if (lo) lo.onclick = () => { api.logout(); location.reload(); };
  const si = document.getElementById('signin-btn');
  if (si) si.onclick = () => {
    if (window.Flow) Flow.signInModal('continue');
    else location.href = 'upload.html';
  };
  document.getElementById('wallet-btn').onclick = async () => {
    try {
      if (api.wallet) {
        if (confirm('Disconnect wallet ' + api.wallet + '?')) {
          api.disconnectWallet();
          renderUser();
        }
      } else {
        await api.connectWallet();
        renderUser();
      }
    } catch (e) { alert(e.message); }
  };
}

// Keep the nav button in sync when the user switches accounts.
if (window.ethereum && window.ethereum.on) {
  window.ethereum.on('accountsChanged', (accounts) => {
    api.wallet = (accounts && accounts[0]) || '';
    renderUser();
  });
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function fmtDur(sec) {
  if (!sec && sec !== 0) return '';
  sec = Math.round(Number(sec) || 0);
  return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
}
function showErr(boxId, msg) {
  const b = document.getElementById(boxId);
  if (b) b.innerHTML = '<div class="err">' + esc(msg) + '</div>';
}
