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

### Added (Nov 13 — Grok "finish the money path" + song booth finishers; keep crypto)
- Money path, crypto-native (Base, BeatNFT.buy(), ETH, wallet signatures, on-chain receipts — no fiat/card checkout, no off-chain payment workaround): producer "List for sale" form on the beat page (real setPrice + stockForSale, lease price/stock + exclusive price, two wallet confirmations per type) with a deep link (#list) and a mobile deep-link card; one-tap Buy now now ends in a receipt card (tx hash on Basescan, license type, total, download your licensed audio, free re-downloads from Profile → My purchases) and records the purchase on the backend (POST /v1/transactions, receipt checked on Base when possible, 'pending' when it cannot be checked yet — never faked as completed); producer dashboard on Profile (web + mobile: earnings in ETH from completed on-chain sales only, licenses sold, sales by beat, pending offers read live from BeatOffers, my purchases with receipts + downloads, pending feature count). Platform fee: NOT set — a single clearly-marked hook (VBEATS_PLATFORM_FEE, bps 0, status 'undecided') plus honest copy everywhere ("full listed price goes to the producer, no platform fee on direct buys (fee not set yet)"); the BeatNFT contract is untouched. Chain down degrades Buy now to "Make offer" everywhere (web + mobile).
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
- User authentication and wallet connection
- Beat creation and recording interface
- Audio waveform visualization
- Beats marketplace
- Payment integration with Stripe
- NFT minting for beats
- Real-time notifications
- Social features (following, comments)
- Advanced audio editing tools
