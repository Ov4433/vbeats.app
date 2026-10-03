# BeatNFT: design note

Status: implemented, tested 6/6 — not yet deployed. `contracts/contracts/BeatNFT.sol`.

## What it is

ERC-1155 license tokens for beats. `tokenId = uint256(fingerprint)`, so each
token is cryptographically bound to the exact audio registered in
`BeatRegistry`. Metadata (`uri`) is read live from the beat's registry entry,
so the token always describes the registered audio — no stale IPFS JSON.

## The lease model

- `mintLease(fingerprint, to, amount)` — producer mints N lease editions.
  Only the fingerprint's registered owner can mint.
- `mintExclusive(fingerprint, to)` — the 1-of-1 exclusive. One per beat, ever.
- `setPrice(fingerprint, priceWei)` + `stockForSale` + `buy(fingerprint, amount)`
  — producer stocks licenses in the contract, lists a price, anyone buys with
  ETH and the producer is paid in the same transaction.
- `transferBeat` on the registry stays the ownership primitive; the NFT is the
  commercial layer on top.

## Royalties

EIP-2981, 10% (`ROYALTY_BPS = 1000`), set per-token to the beat's producer at
mint time. Marketplaces that honor 2981 pay the producer on secondary sales
automatically.

## Deploy

`npx hardhat run scripts/deploy.ts --network base` deploys both contracts and
prints the three Render env vars: `RPC_URL`, `BEAT_REGISTRY_ADDRESS`,
`BEAT_NFT_ADDRESS`.

## Still to do (later milestones)

- Wallet-connect on the website so producers mint to their own address
  (today minting is producer-wallet / relayer driven).
- USDC purchases (currently ETH-only in `buy`).
- Listing lease tiers with different prices (currently one price per beat).
