# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-08-31

### Added
- Initial project setup with Expo and React Native
- Bottom tab navigation (Home, Beats, Profile)
- Screen components (HomeScreen, BeatsScreen, ProfileScreen)
- Reusable UI components (Button, Card)
- API service module for backend communication
- Blockchain service with ethers.js integration
- Authentication context and hooks
- Utility functions and constants
- Contributing guidelines
- Comprehensive README with setup instructions

### Infrastructure
- Expo configuration for iOS, Android, and Web
- EAS build configuration for app distribution
- Jest testing framework setup
- TypeScript support ready
- Environment configuration template

## [Unreleased]

### Added (Nov 13 — unified flow: honest badges, ETH-first prices, one-tap buy; Star: "Take all the best from each and make it flow")
- Unified VBeats flow (web + mobile, from the ChatGPT / Grok / Claude reviews, judged against the real code and the purple/pink + gold-on-black branding): honest verified badge driven by a real fingerprint or on-chain proof (per-card proof lazy on scroll via `/verify-batch`, never a hard-coded badge); ETH-first prices everywhere (never "$" + an ETH number); Trending by plays + votes (true weekly trending from the backend `?window=7d`, lifetime fallback when fewer than 3 beats); beat page reordered to art/player → price → one Buy license button → proof → offers; home CTA that changes with wallet and Volt Pass state; persistent wallet chip + Base chain pill; global sticky player; sign-in as a modal that returns you to where you were; claim as a stepper; upload as a 3-step wizard.
- Gap-fixes in the same build: mic AudioContext resume + count-in + real mic state (the hum button could stay suspended and hear nothing on phones); direct Buy license wired to the real `BeatNFT.buy()` with an honest "via offer" fallback when a beat has no price/stock; Help Center + SafeLock pages showing real fingerprint/on-chain status only — no fake copyright detection, no purchase-history list; live crew — Spark brains gated on the user's key + a passed test (Forte loop + post-hum summary, LIVE/Scripted tags, one call per tap max, 30s timeout) and "Say it" Transcribe ears (5s file → transcript → describe-a-beat). NOT built: Muse Image, realtime Transcribe, Privy auth. Backend parts need a Render redeploy to work live; the client falls back gracefully until then.
- VBEATS membership wiring (audit + wire, Nov 13): the VoltPass claim page/stepper, Profile pass box, and voting weights (VoltPass 3 / ≥10 VBEATS 2 / else 1) were already wired — the gap was visibility. Added `api.passEligibility()` (`GET /v1/pass/eligibility/:addr`) in `web/js/api.js`, a nav member pill (🦇 Member #N / X VBEATS, cached 60s, empty on failure, never invented) + `window.__vbeatsMember` cache read by `Flow.walletChipHtml`, `.member-pill` CSS; mobile `getPassEligibility` / `getPassMe` in `app/services/beatService.ts` + a member card on `app/screens/ProfileScreen.tsx` (Member #N / balance vs 10 / claim link, hidden on failure or no wallet). Buys stay ETH on Base — VBEATS is the membership coin only, never a payment method.

### Fixed
- Mobile `app/screens/CardsScreen.tsx` hard-coded "✓ VERIFIED" + "$price" on every card — now the HomeScreen pattern: "✓ Fingerprinted" only with a fingerprint, else "Not verified yet", price "X ETH" or "Offer". Zero hard-coded "✓ VERIFIED" remains anywhere in the branch (only a comment explaining its removal).

### Added (Nov 13 — VBEATS staking, 1,000 VBEATS to sell; Star: "Yes, build staking at 1,000 VBEATS", gate refined 23:34 CT: "Stake to sell, buying stays open")
- VBEATS staking (source only — NOT deployed, no deploy attempted): new contract `contracts/contracts/VbeatsStaking.sol` (Ownable, events, repo style). Stake exactly 1,000 VBEATS (18 decimals, `STAKE_AMOUNT = 1000 ether`); `stake()` pulls it via `transferFrom` (approve first — two wallet confirmations), `unstake()` returns the full 1,000. No admin fee, no rewards, no slashing, no lockup — the access IS the reward. `stakedAmount(address)` / `isStaked(address)` views. **Deploy step for Star:** deploy `VbeatsStaking` on **Robinhood Chain (chainId 4663)** — NOT Base, so do NOT add it to `web/deploy.html`'s Base deploy ORDER list — with the single constructor arg `vbeatsToken_ = 0x41b049ad7d0b25e7e534b1986e46a643185f3e24` (the VBEATS token). After deploying, set the address in the backend env `VBEATS_STAKE_ADDRESS=<deployed address>` and redeploy Render — the frontend reads it from the backend, and `window.VBEATS_STAKE_ADDRESS` in `web/js/api.js` stays empty until then (empty = "not deployed yet", never a fake address). This is NOT the existing `BeatStaking` contract (ETH stake-to-lease for beats on Base) — a different thing, untouched.
- Backend stake check: `VBEATS_STAKE_ADDRESS` env in `config.ts`; `checkStake()` / `stakeConfigured()` / `STAKE_REQUIRED = '1000'` in `passService.ts` (reads `stakedAmount` on Robinhood Chain via the existing `rhcRpcUrl` pattern). New `GET /v1/pass/stake/:address` returning `{ configured, staked, stakedFormatted, isStaked, required: '1000' }` — while undeployed it answers `configured: false` with a zero stake, never a fake active stake. `/v1/pass/eligibility/:address` and `/v1/pass/me/:address` now also return namespaced stake fields (`stakeConfigured`, `isStaked`, `staked`, `stakedFormatted`, `stakeRequired`) — additive only, and namespaced so they never overwrite the holding's `configured`. A staker counts as a member: vote weight now gives a staker weight 2 (same tier as a ≥10 VBEATS holder; Volt Pass still 3) in `voteService.ts`, because staking moves the tokens out of the wallet and the balance check alone would wrongly drop a staker to weight 1.
- Web (`web/js/api.js`): `VBEATS_STAKE_ADDRESS` (empty placeholder), `VBEATS_TOKEN_ADDRESS`, Robinhood Chain config (4663), `VBEATS_STAKING_ABI`, `api.passStake(address)`, `api.stakeVbeats()` (approve + stake, two confirmations, skips approve when allowance already covers it) and `api.unstakeVbeats()` — both refuse plainly while the address is empty. `Flow.stakeGateNoteHtml(feature, staked)` soft copy helper (`web/js/flow.js`).
- Stake card on Profile (`web/profile.html`, extends the pass-box area) and on the claim page (`web/claim.html`, extends the claim card): shows the 1,000 VBEATS requirement, the user's real VBEATS balance from the eligibility endpoint, stake status (not staked / staked + amount), a Stake button (two confirmations, explained) and an Unstake button (returns the full amount). **Until the contract is deployed the card says "Staking goes live after the stake contract is deployed" and there is NO live Stake button.** Gate (refined Nov 13 23:34 CT): the stake is required ONLY to sell — listing a beat, making a song, the producer dashboard and the feature inbox. The studio stays free, buying beats in ETH stays open to everyone, and voting keeps its existing hold-based weights — no stake required to vote or buy. Gated surfaces show honest soft copy only — a stake note under the producer dashboard on Profile, a stake note on the "List for sale" card (`web/beat.html`), and a stake note in the Make-a-song publish card (`web/make.html`), each linking one tap to the Stake card — nothing is hard-blocked, so the money path keeps working. Buys stay ETH on Base, VBEATS stays the membership coin, 5% fee stays ETH via BeatEscrow; no VBEATS payment path, no fiat/card checkout.
- Mobile (`app/services/beatService.ts`, `app/screens/ProfileScreen.tsx`): `StakeStatus` type + `getPassStake()`, stake fields on `PassEligibility` / `PassMe`, same Stake card under the member card (undeployed / not staked / staked states) + the soft stake note in the dashboard section. Stake/unstake deep-link to the real web claim page (`claim.html#stake`) — mobile never fakes the tx.

### Added (Nov 13 — 5% platform fee via BeatEscrow; Star: "5% is the fee")
- Platform fee is SET: 5% (500 bps), enforced on-chain by BeatEscrow at settlement (treasury = studio wallet, verified live on Base; MAX_FEE_BPS 1000). Buys stay ETH on Base, VBEATS stays the membership coin — no VBEATS payment path, no fiat/card checkout. The single hook is now `VBEATS_PLATFORM_FEE = { bps: 500, status: 'set' }` (`web/js/api.js`); `Flow.feeNoteHtml(path)` is path-aware — escrow (default): "5% platform fee — the producer gets 95% of the listed price… taken by BeatEscrow at settlement"; direct: "Direct sale — this listing predates the 5% fee: the full listed price goes to the producer. New listings sell through escrow with the 5% fee." — plus `Flow.feeSplit(total)` for the buy-panel split preview.
- Escrow client (`web/js/api.js`): `listOnEscrow` (checks the producer still holds the licenses in-wallet — tokens already stocked in BeatNFT for a direct sale cannot move to escrow since BeatNFT has no withdraw, and the UI says so honestly instead of sending a doomed tx — grants escrow approval when needed, lists the lot at price × amount with a 1h–90d expiry, reads the listing id from the Listed event) and `buyViaEscrow` (Vouch check first with a plain "not Vouch-verified yet" message — vouching is studio-only, no self-serve flow — then fund() + settle() chained with tx progress). `isVouched`, `VBEATS_ESCROW_ADDRESS` (0xadB31f545Ba2eC6469aFFdcF3d7375D19a005e45) and `VBEATS_VOUCH_ADDRESS` added. NOTE: the VouchSBT address could not be cross-checked in `web/js/deploy-data.js` (that file carries ABIs/bytecode only, no deployed addresses) — confirm it on Basescan before the first live escrow sale.
- Beat page (`web/beat.html`): escrow listing is now the primary "List via escrow" action (same price/stock inputs + expiry days, default 30); the old setPrice/stockForSale form stays as a clearly-labelled "Legacy direct listing — no platform fee on this listing". Buy panel is escrow-first: active escrow listing → "Buy now" via escrow with "Total X ETH — producer gets Y ETH (95%), platform fee Z ETH (5%)" and a Vouch pre-check; else a direct listing → legacy direct buy with "Total X ETH — no fees added."; else via offer. Escrow receipt card shows the settle tx hash + the fund tx hash + download, same as the direct receipt.
- Backend escrow registry: new `EscrowListing` model + migration `20261114040000_escrow_listings` (also adds `Transaction.channel` + `feeEth`); `POST /v1/escrow-listings` (producer only, verified on-chain via `escrow.listings(listingId)` — seller + fingerprint + active + nft + tokenId + amount + price must match, else 400) and public `GET /v1/escrow-listings/by-beat/:beatId` (active only, with a best-effort on-chain active re-check so settled/cancelled listings stop showing). Mounted in `app.ts`; `BEAT_ESCROW_ADDRESS` / `VOUCH_ADDRESS` env added to `config.ts`.
- Purchase recording + dashboard: `recordPurchase` accepts `channel` ('direct' | 'escrow', default 'direct'); escrow receipts are the settle tx and must be sent to the escrow contract to count as completed. Dashboard `earningsEth` is now the producer NET (gross − 5% fee on escrow sales + 100% of direct sales), with new `grossEth` + `feeEth` totals and per-beat `eth` (net) + `feeEth`; only completed on-chain sales count, as before. Web + mobile Profile show gross / fee / net when the new backend has landed and fall back to the old single number otherwise.
- Mobile (`BeatDetailScreen.tsx`, `ProfileScreen.tsx`, `beatService.ts`): escrow buy + escrow listing deep-link to the real web beat page (#buy / #list) — mobile never fakes an escrow tx; dashboard types carry the new gross/fee/net fields.

### Changed
- Direct BeatNFT listings are now legacy 0%-fee sales: the contract itself is untouched (no redeploy — taking a fee on `BeatNFT.buy()` would need one, and that is out of scope). Fee copy everywhere now says 5% via escrow / legacy direct, instead of "fee not set yet".

### Added (Nov 13 — Grok "finish the money path" + song booth finishers; keep crypto)
- Money path, crypto-native (Base, BeatNFT.buy(), ETH, wallet signatures, on-chain receipts — no fiat/card checkout, no off-chain payment workaround): producer "List for sale" form on the beat page (real setPrice + stockForSale, lease price/stock + exclusive price, two wallet confirmations per type) with a deep link (#list) and a mobile deep-link card; one-tap Buy now now ends in a receipt card (tx hash on Basescan, license type, total, download your licensed audio, free re-downloads from Profile → My purchases) and records the purchase on the backend (POST /v1/transactions, receipt checked on Base when possible, 'pending' when it cannot be checked yet — never faked as completed); producer dashboard on Profile (web + mobile: earnings in ETH from completed on-chain sales only, licenses sold, sales by beat, pending offers read live from BeatOffers, my purchases with receipts + downloads, pending feature count). Platform fee: NOT set at the time of that build — a single clearly-marked hook (VBEATS_PLATFORM_FEE, bps 0, status 'undecided') plus honest copy everywhere ("full listed price goes to the producer, no platform fee on direct buys (fee not set yet)"); the BeatNFT contract is untouched. **Superseded the same night — see the 5% fee via BeatEscrow entry above (fee now set, 500 bps).** Chain down degrades Buy now to "Make offer" everywhere (web + mobile).
- Song booth finishers: true offline mix export in Make a song (OfflineAudioContext render → downloadable .wav, honest failure note when the beat can't be fetched for offline rendering); bar grid + waveform canvas in the booth (grid from the beat's BPM, waveform of the selected/best take); best-of-3 retakes (keep up to 3 takes, mark one best, delete the rest, publishing uses selected → best → latest; mobile has the same takes list, metronome as a vibration per count-in beat, and a bar-grid row — mix export stays web-only there); optional metronome click in the count-in (web, off by default); "Co-signed by …" badge on accepted-feature songs (feed cards + beat pages, web + mobile, from the real accepted FeatureRequest); share card for beats and songs (native share sheet or copy link — always the real beat/song URL, never a fake short link).
- Volt floating button no longer covers the bottom tab bar on phones: on has-tabbar pages the fab lifts clear of the tab bar height plus safe-area, and the toast/panel lift with it; the fab is slightly smaller on small screens. Desktop positions unchanged.

### Fixed
- Mobile Profile showed hardcoded 0 Beats / 0 Sales / $0 Earnings — now shows the real dashboard (or "—" with an honest note while the backend update hasn't landed).

### Added (Nov 13 — Grok "Do all": finish the Rapchat song loop)
- Mixed preview in Make a song (web): each take gets a ▶ Mix button — the parent beat looped under the vocal, sample-synced via Web Audio, with an honestly labelled HTMLAudio rough-sync fallback when the browser can't lock the two tracks; the dry vocal stays on the take's own player.
- Timed 16-bar booth (web + mobile): 8 / 16 / 32 bars / Free chips, timed from the parent beat's BPM (default 140), 1-bar count-in, auto-stop at the window end, live "bars left" readout.
- Feed filter: Beats · Songs (web Home toggle All | Beats | Songs, server `?kind=` filter on marketplace/list/search, client-side filter on top for old-backend safety, honest empty states).
- Feature / co-sign requests: new FeatureRequest model + migration `20261114020000_songs_and_features`, API `POST /v1/features`, `GET /v1/features/inbox`, `GET /v1/features/sent`, `POST /v1/features/:id/respond` (accept → song live, decline → song rejected); "Request feature" card on song pages (web + mobile) and a Feature requests inbox + sent list on Profile (web + mobile). Plain DB/API — no on-chain co-sign.
- Vote gate: a pending or rejected song cannot be voted on (honest 400) and never surfaces in Top Voted (week + all-time).

### Fixed
- Pending songs could be voted on and surface in Top Voted — now blocked at the vote endpoint and filtered from both rankings.

### Added
- Studio 3-path switcher (Grok, Nov 13): Record (mic → take → publish, with count-in) / Pattern (sequencer + co-producer crew, collapsed by default) / Upload file (link to the 3-step wizard) — only one path visible at a time, default Record (`web/studio.html`, `web/js/studio-paths.js`). Echobeatification + Forte loop stay visible on the Pattern path; only the paid Meta API live-test card moved into a Lab/experimental block
- Make a song, Rapchat-style with VBeats features (Grok, Nov 13): pick a fingerprinted beat → record vocals over it while it loops → takes → publish a fingerprinted song linked to the parent beat (`web/make.html`, `app/screens/MakeSongScreen.tsx`). Feed shows songs as "🎤 Song · over [beat title]"; beat pages get a "🎤 Rap on this beat" CTA; Make sits next to Create in the nav
- Song co-sign (Star's collab canon): a song over your own beat publishes live immediately; a song over someone else's beat is saved as "Awaiting producer co-sign" and stays out of the public feed until the parent beat's producer approves it — `Beat.kind` / `parentBeatId` / `coSignStatus` in the backend, Prisma migration `20261114010000_add_song_kind`, `POST /v1/beats/:id/co-sign` + `GET /v1/beats/pending-co-sign`. No on-chain co-sign exists — this is a plain DB/API pending flag, honestly labelled
- Post-publish next steps now point to "View & list licenses" (studio pattern + take publish, song publish)

### Changed
- Mobile RecordBeat is now Record → Title/genre/price → Publish: the details form is dimmed until a take exists, and the success dialog offers "View beat" or "Record another" (`app/screens/RecordBeatScreen.tsx`); shared `Button` now takes a real `disabled` prop (`app/components/Button.tsx`)
- Mobile BeatDetail shows the song banner + parent-beat link for songs, and "🎤 Rap on this beat" for beats (`app/screens/BeatDetailScreen.tsx`); `Beat` type + `createBeat` now carry `kind` / `parentBeatId` / `coSignStatus` (`app/services/beatService.ts`)

### Not built (per the brief)
- True mixed preview was listed here as not built — it is now built (see the "Do all" entry above: ▶ Mix in make.html; mobile mix is web-only, see MakeSongScreen notes). 16-bar / timed record windows and the Beats · Songs feed filter are likewise now built (same entry above).

## [Unreleased] — earlier Grok flow fixes (Nov 13)

### Added
- Dual-path hero (Grok, Nov 13): Producer vs Listener/Artist cards on web (`web/index.html`) and mobile (`app/screens/HomeScreen.tsx`) — cold web visitors also get How It Works; returning web users get a single CTA based on wallet / Volt Pass state
- Web feed primary CTA (`Flow.primaryCta()` in `web/js/flow.js`): feed cards show "Buy now" only when there is a price signal, otherwise "Make offer", deep-linking to `#buy` / `#offer` on the beat page; `web/beat.html` honours the hash
- Mobile ownership path card (`app/screens/BeatDetailScreen.tsx`): listed → buy, unlisted → offer, with post-purchase next steps (download → release → keep receipt) shown as what happens after you buy
- Honest fingerprint chips on mobile: "✓ Fingerprinted" only when the backend returned a fingerprint, otherwise "Not verified yet" (`app/screens/HomeScreen.tsx`, `app/screens/BeatDetailScreen.tsx`)

### Changed
- Web stories row reduced to Create · Upload · Find beats · Volt Pass; Cards / The Booth / Live stay in nav, not in stories
- Mobile Home feed is now Feed/Trending only — the fake "Following" tab is gone; trending sorts by plays + votes, never by price (when the backend returns no plays/votes, backend order is kept instead of inventing a sort)
- Mobile prices are ETH-first, never "$" + an ETH number: `app/screens/HomeScreen.tsx`, `app/screens/ExploreScreen.tsx`, `app/screens/BeatDetailScreen.tsx` show "X ETH" or "Offer"
- Mobile primary Button colour is brand pink `#ff3d9a` instead of iOS blue (`app/components/Button.tsx`); BeatDetail iOS-blue accents switched to brand pink too
- Web dual-path card styles (`.path-row`, `.path-card`) in brand purple/pink + gold-on-black (`web/css/style.css`)

### Planned Features
- VbeatsStaking contract deploy on Robinhood Chain (Star's tap) + `VBEATS_STAKE_ADDRESS` in the Render backend env — staking goes live after that
- Render redeploy + `prisma migrate deploy` for the four new migrations (song kind, songs/features, money path, escrow listings) + `BEAT_ESCROW_ADDRESS` / `VOUCH_ADDRESS` env
- User authentication and wallet connection
- Beat creation and recording interface
- Audio waveform visualization
- Beats marketplace
- Crypto-native payments on Base (ETH, BeatNFT / BeatEscrow — no fiat/card checkout, per Star: "keep crypto")
- NFT minting for beats
- Real-time notifications
- Social features (following, comments)
- Advanced audio editing tools
