# VBeats Contracts

`BeatRegistry.sol` — on-chain registry of beat ownership keyed by the beat's
SHA-256 audio fingerprint.

- `registerBeat(bytes32 fingerprint, string metadataURI)` — records the caller as owner
- `transferBeat(bytes32 fingerprint, address to)` — owner-only transfer
- `getBeat(bytes32)` — returns `(owner, timestamp, metadataURI)`
- `isRegistered(bytes32)` — boolean check used read-only by the backend's `POST /v1/beats/:id/verify`
- Events: `BeatRegistered`, `BeatTransferred`

## Commands

```bash
npm install
npx hardhat compile
npx hardhat test        # in-process network, no RPC needed
npx hardhat run scripts/deploy.ts --network <network>
```

Copy `.env.example` to `.env` for testnet deploys (`RPC_URL`, `DEPLOYER_KEY`).
After deploying, set `BEAT_REGISTRY_ADDRESS=<address>` in `backend/.env` to
enable on-chain verification.
