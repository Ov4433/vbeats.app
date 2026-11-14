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
// --- PLATFORM FEE — SET, 5% (Star decision, Nov 13: "5% is the fee") -----
// The 5% is enforced on-chain by BeatEscrow at settlement (500 bps,
// treasury = the studio wallet 0xEed0867dA5d387DAE2c548A4620c43cb26a9D517,
// verified live on Base: platformFeeBps 500, MAX_FEE_BPS 1000). New
// listings sell through escrow (listOnEscrow / buyViaEscrow below) and
// the producer gets 95% of the listed price. Direct BeatNFT.buy() CANNOT
// take a fee without a BeatNFT redeploy, so direct listings are legacy
// 0%-fee sales: the full listed price goes to the producer. VBEATS stays
// the membership coin; buys stay ETH on Base — no VBEATS payment path,
// no fiat/card checkout anywhere.
window.VBEATS_PLATFORM_FEE = { bps: 500, status: 'set' };
window.VBEATS_ESCROW_ADDRESS = window.VBEATS_ESCROW_ADDRESS || '0xadB31f545Ba2eC6469aFFdcF3d7375D19a005e45';
// VouchSBT (buyer verification for escrow fund): address as supplied
// for this build. NOTE — web/js/deploy-data.js carries contract ABIs
// and bytecode only, no deployed addresses, so this address could NOT
// be cross-checked against that file; confirm it on Basescan before
// the first live escrow sale if it has not been verified already.
window.VBEATS_VOUCH_ADDRESS = window.VBEATS_VOUCH_ADDRESS || '0xA461b14a4a098544b5525959cE670A3f53E9FEdD';
window.VBEATS_TREASURY_ADDRESS = window.VBEATS_TREASURY_ADDRESS || '0xEed0867dA5d387DAE2c548A4620c43cb26a9D517';
// --- VBEATS staking (Nov 13 — Star: "Yes, build staking at 1,000 VBEATS") -
// Stake exactly 1,000 VBEATS to SELL: listing beats for sale, making
// songs, the producer dashboard and the feature inbox. The free
// studio stays free, and buying beats in ETH stays open to everyone —
// the stake is only required to sell. Voting stays open with its
// existing hold-based weights (no stake required to vote). Unstake
// returns the full 1,000: no slashing, no lockup, no yield — the access
// IS the reward. VBEATS lives on Robinhood Chain (chainId 4663); the
// stake contract lives there too. VBEATS_STAKE_ADDRESS stays EMPTY until
// the VbeatsStaking contract is deployed — empty means "not deployed
// yet", never a fake address. Buys stay ETH on Base; no VBEATS payment
// path, no fiat/card checkout anywhere.
window.VBEATS_TOKEN_ADDRESS = window.VBEATS_TOKEN_ADDRESS || '0x41b049ad7d0b25e7e534b1986e46a643185f3e24';
window.VBEATS_RHC_CHAIN_ID = window.VBEATS_RHC_CHAIN_ID || 4663;
window.VBEATS_RHC_RPC_URL = window.VBEATS_RHC_RPC_URL || 'https://rpc.mainnet.chain.robinhood.com';
window.VBEATS_STAKE_ADDRESS = window.VBEATS_STAKE_ADDRESS || '';
window.VBEATS_STAKE_REQUIRED = window.VBEATS_STAKE_REQUIRED || '1000';
const BEAT_NFT_ABI = [
  'function buy(bytes32 fingerprint, bool exclusive, uint256 amount) payable',
  'function licensePrice(uint256 tokenId) view returns (uint256)',
  'function leaseTokenId(bytes32 fingerprint) view returns (uint256)',
  'function exclusiveTokenId(bytes32 fingerprint) view returns (uint256)',
  'function balanceOf(address account, uint256 tokenId) view returns (uint256)',
  'function isApprovedForAll(address account, address operator) view returns (bool)',
  'function setApprovalForAll(address operator, bool approved)',
  // Producer listing (money path, Nov 13): setPrice + stockForSale are the
  // two on-chain calls that make a beat buyable. listBeat() below runs
  // them in order; the BeatNFT contract itself is untouched.
  'function setPrice(bytes32 fingerprint, bool exclusive, uint256 priceWei)',
  'function stockForSale(bytes32 fingerprint, bool exclusive, uint256 amount)',
];

const BEAT_ESCROW_ABI = [
  // list() moves `amount` licenses seller -> escrow and returns the
  // listing id. priceWei is the TOTAL lot price (fund() requires
  // msg.value == priceWei exactly, and settle() transfers `amount`
  // tokens to the buyer) — not a per-license price.
  'function list(address nft, uint256 tokenId, uint256 amount, uint256 priceWei, bytes32 fingerprint, uint64 expirySeconds) returns (uint256)',
  'function fund(uint256 listingId) payable',
  'function settle(uint256 listingId)',
  'function listings(uint256 listingId) view returns (address seller, address nft, uint256 tokenId, uint256 amount, uint256 priceWei, bytes32 fingerprint, address buyer, uint64 expiresAt, bool active)',
  'function platformFeeBps() view returns (uint16)',
  'event Listed(uint256 indexed listingId, address indexed seller, bytes32 indexed fingerprint, uint256 tokenId, uint256 amount, uint256 priceWei)',
];

const VOUCH_ABI = [
  'function isVerified(address account) view returns (bool)',
];

const VBEATS_STAKING_ABI = [
  'function stake()',
  'function unstake()',
  'function stakedAmount(address account) view returns (uint256)',
  'function isStaked(address account) view returns (bool)',
  'function STAKE_AMOUNT() view returns (uint256)',
  'function token() view returns (address)',
];

const VBEATS_TOKEN_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
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

  /** VBEATS membership read (Nov 13): the wallet's real VBEATS balance
      on Robinhood Chain + Volt Pass state, from the backend. Returns null
      on any failure — callers show nothing rather than inventing a
      balance or a member badge. */
  async passEligibility(address) {
    if (!address) return null;
    try { return await this.get('/v1/pass/eligibility/' + encodeURIComponent(address)); }
    catch { return null; }
  },

  /** VBEATS stake read (Nov 13): { configured, staked, stakedFormatted,
      isStaked, required: '1000' } from the backend. configured=false
      means the stake contract is not deployed yet — staking is not live.
      Returns null on any failure — callers show the "not live yet" /
      "waking up" copy, never a fake stake. */
  async passStake(address) {
    if (!address) return null;
    try { return await this.get('/v1/pass/stake/' + encodeURIComponent(address)); }
    catch { return null; }
  },
  myTransactions() { return this.get('/v1/transactions'); },
  recordPurchase(beatId, txHash, amountEth, licenseKind, channel) {
    return this.post('/v1/transactions', { beatId, txHash, amountEth, licenseKind, channel: channel || 'direct' });
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

  // --- Escrow listings (backend registry — escrow has no fingerprint
  // lookup, so the buy panel finds the active listing for a beat here).
  // 404 = old backend — escrowListings() returns [] and the buy panel
  // falls back to the direct listing, never a fake escrow sale.
  reportEscrowListing(body) { return this.post('/v1/escrow-listings', body); },
  async escrowListings(beatId) {
    try {
      const d = await this.get('/v1/escrow-listings/by-beat/' + encodeURIComponent(beatId));
      return (d && d.listings) || [];
    } catch (e) {
      if (String(e.message || '').includes('404')) return [];
      throw e;
    }
  },

  // --- BeatEscrow (5% platform fee, Star decision Nov 13) ---------------
  escrowContract(signerOrProvider) {
    if (!window.VBEATS_ESCROW_ADDRESS) throw new Error('Escrow contract is not deployed yet');
    if (typeof ethers === 'undefined') throw new Error('Wallet library failed to load');
    return new ethers.Contract(window.VBEATS_ESCROW_ADDRESS, BEAT_ESCROW_ABI, signerOrProvider);
  },

  vouchContract(provider) {
    if (!window.VBEATS_VOUCH_ADDRESS) throw new Error('Vouch contract is not deployed yet');
    if (typeof ethers === 'undefined') throw new Error('Wallet library failed to load');
    return new ethers.Contract(window.VBEATS_VOUCH_ADDRESS, VOUCH_ABI, provider);
  },

  /** Is this wallet Vouch-verified (allowed to fund an escrow sale)?
      VouchSBT.issue() is owner-only — buyers get vouched by the studio;
      there is no self-serve vouch flow. */
  async isVouched(address) {
    if (!address) return false;
    await ensureEthers();
    const provider = new ethers.JsonRpcProvider(window.VBEATS_RPC_URL);
    return !!(await this.vouchContract(provider).isVerified(address));
  },

  /** Producer escrow listing: deposits `amount` licenses into BeatEscrow
      for one lot price, so the buyer's 5% fee is taken at settlement.
      priceEth here is the PER-LICENSE price; the lot total sent to the
      contract is priceEth × amount (exclusive: amount is always 1).
      Who holds the tokens matters (BeatNFT.sol): mintLease /
      mintExclusive mint to the producer's wallet, and stockForSale moves
      them into the BeatNFT contract. list() can only move tokens the
      producer still holds — tokens already stocked in BeatNFT for a
      direct sale CANNOT move to escrow (BeatNFT has no withdraw), so
      this refuses with a plain message instead of sending a doomed tx:
      those stay legacy direct sales, and fresh mints can be escrowed.
      Also grants the escrow contract approval first when needed.
      Returns { listingId, txHash, tokenId, amount, priceWei } where
      priceWei is the total lot price in wei. */
  async listOnEscrow(fingerprint, opts = {}) {
    if (!fingerprint) throw new Error('Beat not loaded yet');
    const exclusive = !!opts.exclusive;
    const amount = exclusive ? 1 : Math.max(1, Math.floor(Number(opts.amount) || 1));
    const priceEth = Number(opts.priceEth);
    if (!isFinite(priceEth) || priceEth <= 0) throw new Error('Enter a price in ETH to list via escrow.');
    const expiryDays = Math.min(90, Math.max(1 / 24, Number(opts.expiryDays) || 30));
    const expirySeconds = Math.min(90 * 86400, Math.max(3600, Math.floor(expiryDays * 86400)));
    await ensureEthers();
    const fp = this.fpHex(fingerprint);
    const provider = new ethers.JsonRpcProvider(window.VBEATS_RPC_URL);
    const read = this.nftContract(provider);
    const tokenId = await read.licenseTokenId(fp, exclusive);
    const signer = await this.getSigner();
    const seller = (await signer.getAddress()).toLowerCase();
    const [myBalance, stockedBalance] = await Promise.all([
      read.balanceOf(seller, tokenId),
      read.balanceOf(window.VBEATS_NFT_ADDRESS, tokenId),
    ]);
    if (myBalance < BigInt(amount)) {
      if (stockedBalance >= BigInt(amount)) {
        throw new Error(
          exclusive
            ? 'Your exclusive is already stocked in the BeatNFT contract for a direct sale, so it cannot move to escrow — BeatNFT has no way to take it back. That listing stays a legacy direct sale (no platform fee); the exclusive can only sell that way.'
            : 'Your leases for this beat are already stocked in the BeatNFT contract for direct sale, so they cannot move to escrow — BeatNFT has no way to take them back. Those stay legacy direct sales (no platform fee). Mint fresh leases to yourself and list those via escrow instead.'
        );
      }
      throw new Error(
        'You hold no ' + (exclusive ? 'exclusive' : 'lease') + ' licenses for this beat in your wallet yet — mint them to yourself first (mintLease / mintExclusive on BeatNFT), then list them via escrow.'
      );
    }
    const nft = this.nftContract(signer);
    if (window.Flow) Flow.txPending('Checking escrow approval');
    if (!(await nft.isApprovedForAll(seller, window.VBEATS_ESCROW_ADDRESS))) {
      if (window.Flow) Flow.txPending('Approving escrow to hold your licenses');
      const t0 = await nft.setApprovalForAll(window.VBEATS_ESCROW_ADDRESS, true);
      await t0.wait();
    }
    const totalWei = ethers.parseEther(String(priceEth)) * BigInt(amount);
    const escrow = this.escrowContract(signer);
    if (window.Flow) Flow.txPending('Listing via escrow — licenses move into escrow');
    const tx = await escrow.list(window.VBEATS_NFT_ADDRESS, tokenId, amount, totalWei, fp, expirySeconds);
    const receipt = await tx.wait();
    let listingId = null;
    try {
      for (const log of receipt.logs || []) {
        try {
          const parsed = escrow.interface.parseLog(log);
          if (parsed && parsed.name === 'Listed') { listingId = Number(parsed.args.listingId); break; }
        } catch { /* not our event */ }
      }
    } catch { /* listing id unreadable — reported below */ }
    if (window.Flow) Flow.txConfirmed('Listed via escrow' + (listingId != null ? ' — listing #' + listingId : ''), tx.hash);
    return { listingId, txHash: tx.hash, tokenId: tokenId.toString(), amount, priceWei: totalWei.toString() };
  },

  /** Escrow buy: fund() the exact lot price, then settle() in the same
      tap — settle sends the NFT to the buyer, 5% to the treasury and
      95% to the producer (or the collab split for an approved take).
      Checks Vouch first and throws a plain message when the buyer is
      not verified — no wallet pop-up for a tx that must revert. If
      fund mines but settle fails, the ETH stays locked in escrow until
      the buyer calls refund() on the contract — the error says so.
      Returns { fundHash, settleHash }. */
  async buyViaEscrow(listingId, priceWei) {
    if (listingId == null) throw new Error('No escrow listing to buy from');
    const price = BigInt(priceWei);
    if (price <= 0n) throw new Error('That escrow listing has no price — it cannot be bought.');
    await ensureEthers();
    const signer = await this.getSigner();
    const buyer = await signer.getAddress();
    if (!(await this.isVouched(buyer))) {
      throw new Error('You are not Vouch-verified yet — escrow sales are for verified buyers only. Vouching is done by the studio (there is no self-serve vouch); ask the studio to vouch your wallet, then try again.');
    }
    const escrow = this.escrowContract(signer);
    if (window.Flow) Flow.txPending('Funding the escrow sale');
    let fundHash;
    try {
      const fundTx = await escrow.fund(listingId, { value: price });
      await fundTx.wait();
      fundHash = fundTx.hash;
    } catch (e) {
      throw new Error('Escrow funding failed: ' + (e.message || e));
    }
    if (window.Flow) Flow.txPending('Settling — NFT to you, 95% to the producer, 5% to the treasury');
    try {
      const settleTx = await escrow.settle(listingId);
      await settleTx.wait();
      if (window.Flow) Flow.txConfirmed('License bought via escrow', settleTx.hash);
      return { fundHash, settleHash: settleTx.hash };
    } catch (e) {
      throw new Error('Funded, but settlement failed: ' + (e.message || e) + ' Your ETH is locked in escrow until you call refund() on the BeatEscrow contract — ask the studio for help rather than paying again.');
    }
  },

  /** --- VBEATS staking (Nov 13) -----------------------------------------
      Stake exactly 1,000 VBEATS on Robinhood Chain to sell (listing,
      Make a song, producer dashboard). Two wallet confirmations, standard ERC20 staking: (1) approve the
      stake contract to pull 1,000 VBEATS, (2) stake(). Unstake returns
      the full 1,000 — no lockup, no slashing, no yield; the access is
      the reward. Both refuse plainly while VBEATS_STAKE_ADDRESS is
      empty (contract not deployed yet) — never a fake transaction. */
  stakeContract(signerOrProvider) {
    if (!window.VBEATS_STAKE_ADDRESS) throw new Error('Staking is not live yet — the stake contract has not been deployed. Nothing to sign.');
    if (typeof ethers === 'undefined') throw new Error('Wallet library failed to load');
    return new ethers.Contract(window.VBEATS_STAKE_ADDRESS, VBEATS_STAKING_ABI, signerOrProvider);
  },

  async ensureRhcChain() {
    const chainIdHex = '0x' + Number(window.VBEATS_RHC_CHAIN_ID).toString(16);
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain', params: [{ chainId: chainIdHex }],
      });
    } catch (e) {
      if (e && e.code === 4902) {
        throw new Error('Your wallet does not have Robinhood Chain yet — add it in your wallet (chain ID 4663, the chain VBEATS lives on), then try again.');
      }
      throw e;
    }
  },

  async getRhcSigner() {
    if (!this.wallet) throw new Error('Connect your wallet first');
    if (!window.ethereum) throw new Error('No wallet found');
    await ensureEthers();
    await this.ensureRhcChain();
    return new ethers.BrowserProvider(window.ethereum).getSigner();
  },

  /** Stake 1,000 VBEATS. Two confirmations: approve, then stake.
      Skips the approve step when the allowance already covers it.
      Returns { approveHash, stakeHash } (approveHash is null when the
      approval was already in place). */
  async stakeVbeats() {
    if (!window.VBEATS_STAKE_ADDRESS) throw new Error('Staking is not live yet — the stake contract has not been deployed.');
    await ensureEthers();
    const signer = await this.getRhcSigner();
    const staker = await signer.getAddress();
    const token = new ethers.Contract(window.VBEATS_TOKEN_ADDRESS, VBEATS_TOKEN_ABI, signer);
    const amount = ethers.parseUnits(window.VBEATS_STAKE_REQUIRED, 18);
    let approveHash = null;
    if ((await token.allowance(staker, window.VBEATS_STAKE_ADDRESS)) < amount) {
      if (window.Flow) Flow.txPending('Approve 1,000 VBEATS for staking (confirmation 1 of 2)');
      const t0 = await token.approve(window.VBEATS_STAKE_ADDRESS, amount);
      await t0.wait();
      approveHash = t0.hash;
    }
    const staking = this.stakeContract(signer);
    if (window.Flow) Flow.txPending('Stake 1,000 VBEATS (confirmation 2 of 2)');
    const tx = await staking.stake();
    await tx.wait();
    if (window.Flow) Flow.txConfirmed('Staked — everything unlocked', tx.hash);
    return { approveHash, stakeHash: tx.hash };
  },

  /** Unstake: the full 1,000 VBEATS returns to your wallet. One
      confirmation. Returns the tx hash. */
  async unstakeVbeats() {
    if (!window.VBEATS_STAKE_ADDRESS) throw new Error('Staking is not live yet — the stake contract has not been deployed.');
    await ensureEthers();
    const signer = await this.getRhcSigner();
    const staking = this.stakeContract(signer);
    if (window.Flow) Flow.txPending('Unstaking — your full 1,000 VBEATS comes back');
    const tx = await staking.unstake();
    await tx.wait();
    if (window.Flow) Flow.txConfirmed('Unstaked — 1,000 VBEATS returned', tx.hash);
    return tx.hash;
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

// VBEATS membership pill in the nav (Nov 13): the connected wallet's
// real VBEATS balance + Volt Pass member number, from
// /v1/pass/eligibility/. Cached 60s per wallet; any failure leaves the
// pill empty — the chip never shows a balance or badge that wasn't
// returned by the backend.
let memberCache = { addr: '', at: 0, data: null };
function memberPillHtml(d) {
  if (!d || d.configured === false) return '';
  if (d.hasPass) return `<a class="member-pill" href="profile.html" title="Volt Pass member">🦇 Member #${esc(d.memberNumber ?? '')}</a>`;
  const bal = Number(d.balanceFormatted || 0);
  if (bal > 0) return `<a class="member-pill" href="claim.html" title="VBEATS balance — claim your Volt Pass at 10 VBEATS">${esc(d.balanceFormatted)} VBEATS</a>`;
  return '';
}
async function refreshMemberPill(w) {
  const pill = document.getElementById('member-pill');
  if (!pill || !w) return;
  const now = Date.now();
  let d = (memberCache.addr === w && now - memberCache.at < 60000) ? memberCache.data : null;
  if (!d) {
    d = await api.passEligibility(w);
    memberCache = { addr: w, at: now, data: d };
  }
  window.__vbeatsMember = d;
  pill.innerHTML = memberPillHtml(d);
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
    html += ` ${dot}<button class="btn ghost small" id="wallet-btn" title="${esc(w)} — tap to disconnect">${esc(w.slice(0, 6))}…${esc(w.slice(-4))}</button><span id="member-pill"></span>`;
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
  if (w) refreshMemberPill(w);
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
