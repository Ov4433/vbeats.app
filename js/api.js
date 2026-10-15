/* Verified Beats Studio — shared API client + nav */
window.VBEATS_API = window.VBEATS_API || 'https://vbeats-api.onrender.com';

// --- Chain config (Base mainnet). Contract addresses are empty until deploy. ---
window.VBEATS_CHAIN_ID = window.VBEATS_CHAIN_ID || 8453;
window.VBEATS_RPC_URL = window.VBEATS_RPC_URL || 'https://mainnet.base.org';
window.VBEATS_REGISTRY_ADDRESS = window.VBEATS_REGISTRY_ADDRESS || '';
window.VBEATS_NFT_ADDRESS = window.VBEATS_NFT_ADDRESS || '';
window.VBEATS_OFFERS_ADDRESS = window.VBEATS_OFFERS_ADDRESS || '';

// Minimal BeatOffers ABI for the actions the site performs.
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
  verify(id) { return this.post('/v1/beats/' + encodeURIComponent(id) + '/verify', {}); },
  nft(id) { return this.get('/v1/beats/' + encodeURIComponent(id) + '/nft'); },
  offers(id) { return this.get('/v1/beats/' + encodeURIComponent(id) + '/offers'); },
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
    if (typeof ethers === 'undefined') throw new Error('Wallet library failed to load — check your connection');
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
    if (typeof ethers === 'undefined') throw new Error('Wallet library failed to load');
    await this.ensureBaseChain();
    return new ethers.BrowserProvider(window.ethereum).getSigner();
  },

  offersContract(signerOrProvider) {
    if (!window.VBEATS_OFFERS_ADDRESS) throw new Error('Offers contract is not deployed yet');
    if (typeof ethers === 'undefined') throw new Error('Wallet library failed to load');
    return new ethers.Contract(window.VBEATS_OFFERS_ADDRESS, BEAT_OFFERS_ABI, signerOrProvider);
  },

  /** On-chain producer (beat owner) for a fingerprint, via the registry. */
  async producerOf(fingerprint) {
    if (!window.VBEATS_REGISTRY_ADDRESS || !fingerprint) return null;
    if (typeof ethers === 'undefined') throw new Error('Wallet library failed to load');
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
    await tx.wait();
    return tx.hash;
  },
};

function nav(active) {
  const links = [
    ['index.html', 'Home'], ['marketplace.html', 'Marketplace'],
    ['studio.html', 'Studio'], ['chat.html', 'Chat'], ['upload.html', 'Upload'],
  ];
  const el = document.getElementById('nav');
  el.innerHTML =
    '<div class="nav-in">' +
    '<a class="brand" href="index.html"><img src="assets/logo.png" alt="logo"><span>Verified Beats Studio</span></a>' +
    '<div class="nav-links">' +
    links.map(([h, t]) => `<a href="${h}" class="${h === active ? 'on' : ''}">${t}</a>`).join('') +
    '</div><div class="nav-right" id="nav-user"></div></div>';
  renderUser();
}

function renderUser() {
  const box = document.getElementById('nav-user');
  if (!box) return;
  let html = '';
  if (api.loggedIn()) {
    html += '<span>Signed in</span> <button class="btn ghost small" id="logout">Log out</button>';
  } else {
    html += '<a class="btn ghost small" href="upload.html">Sign in</a>';
  }
  const w = api.wallet;
  html += w
    ? ` <button class="btn ghost small" id="wallet-btn" title="${esc(w)} \u2014 tap to disconnect">${esc(w.slice(0, 6))}\u2026${esc(w.slice(-4))}</button>`
    : ' <button class="btn small" id="wallet-btn">Connect wallet</button>';
  box.innerHTML = html;
  const lo = document.getElementById('logout');
  if (lo) lo.onclick = () => { api.logout(); location.reload(); };
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
