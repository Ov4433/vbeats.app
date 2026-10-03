# Register-on-upload: design note

Status: implemented (relayer path) — 2026-10-03. `registerBeatOnChain` in
`backend/src/services/chainService.ts` fires `BeatRegistry.registerBeat`
fire-and-forget from `POST /v1/beats/upload`. Active only when `RELAYER_KEY`
(+ `RPC_URL` + `BEAT_REGISTRY_ADDRESS`) are set; otherwise uploads behave
exactly as before. The user-signing flow (Option B) remains a future
milestone.

## What has to happen at upload time

After the API stores a beat and computes its SHA-256 fingerprint, call
`BeatRegistry.registerBeat(bytes32 fingerprint, string metadataURI)` so
ownership/provenance is provable. That call is a state-changing
transaction: it needs a **signer**.

## The one decision only Star can make: who signs?

**Option A — relayer wallet (backend signs).**
Backend holds a funded relayer private key (`RELAYER_KEY` in Render env),
signs `registerBeat` for every upload, pays gas. Pros: zero friction for
producers, works today with the current app. Cons: we custody a key and
pay gas per upload; key must be rotated/secured.

**Option B — user signs in-app.**
The app (Expo) prompts the producer's connected wallet to sign the
`registerBeat` tx at upload time; backend verifies the receipt before
marking the beat verified. Pros: true self-custody, no key for us to
guard, gas paid by the uploader. Cons: needs wallet-connect style signing
in the mobile app — real mobile work.

Recommendation: start with A (relayer) to make verification real
end-to-end now, keep B as the decentralization milestone. Either way the
deploy itself (Base mainnet, `npx hardhat run scripts/deploy.ts
--network base`) needs Star's wallet — see `contracts/hardhat.config.ts`
`base` network (added, uncommitted).

## After the deploy

1. Set `RPC_URL` and `BEAT_REGISTRY_ADDRESS` in the Render
   `vbeats-api` service env (both already documented in
   `backend/.env.example`).
2. Redeploy; `POST /v1/beats/:id/verify` flips from
   `configured:false` to real chain checks.

## Explicitly out of scope here

On-chain beat purchasing (ETH/USDC), NFT minting, and the Stripe
webhook (still a stub) — separate milestones.
