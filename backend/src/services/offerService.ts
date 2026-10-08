import { ethers } from 'ethers';
import { config } from '../config';

// Minimal ABI for the BeatOffers contract: events + the offers mapping.
const BEAT_OFFERS_ABI = [
  'event OfferMade(uint256 indexed offerId, bytes32 indexed fingerprint, address indexed buyer, bool exclusive, uint256 amount, uint256 priceWei, uint64 expiresAt)',
  'event BidUpdated(uint256 indexed offerId, uint256 newBidWei)',
  'event AskPlaced(uint256 indexed offerId, uint256 askPriceWei)',
  'event OfferFinalized(uint256 indexed offerId, uint64 expiresAt)',
  'function offers(uint256 offerId) view returns (address buyer, address nft, bytes32 fingerprint, bool exclusive, uint256 amount, uint256 priceWei, uint256 askPriceWei, bool isFinal, uint64 expiresAt, bool active)',
] as const;

export interface OfferView {
  offerId: string;
  buyer: string;
  exclusive: boolean;
  amount: string;
  bidEth: string;
  askEth: string | null;
  isFinal: boolean;
  expiresAt: string;
  active: boolean;
  /** Bid/ask/final events: how many rounds the haggling has gone. */
  rounds: number;
  lastActivityAt: string;
  /** Active, 2+ rounds, no movement for 24h: time for Volt's nudge. */
  stalled: boolean;
}

/** No on-chain movement for this long after 2+ rounds = stalled. */
const STALL_AFTER_MS = 24 * 3600 * 1000;

function normalizeFingerprint(fp: string): string | null {
  const hex = fp.startsWith('0x') ? fp : `0x${fp}`;
  return /^0x[0-9a-fA-F]{64}$/.test(hex) ? hex : null;
}

/**
 * Read a beat's offer negotiations from chain events. Graceful when the
 * offers contract isn't deployed/configured yet.
 */
export async function beatOffers(
  fingerprint: string | null
): Promise<{ configured: boolean; offers: OfferView[] }> {
  if (!config.rpcUrl || !config.beatOffersAddress || !fingerprint) {
    return { configured: false, offers: [] };
  }
  const fp = normalizeFingerprint(fingerprint);
  if (!fp) return { configured: true, offers: [] };
  try {
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const contract = new ethers.Contract(
      config.beatOffersAddress,
      BEAT_OFFERS_ABI,
      provider
    );
    const made = await contract.queryFilter(contract.filters.OfferMade(null, fp));
    const views: OfferView[] = [];
    const now = Date.now();
    for (const e of made) {
      const args = (e as unknown as { args: Record<string, bigint> }).args;
      const offerId = args.offerId;
      const o = (await contract.offers(offerId)) as unknown as {
        buyer: string;
        exclusive: boolean;
        amount: bigint;
        priceWei: bigint;
        askPriceWei: bigint;
        isFinal: boolean;
        expiresAt: bigint;
        active: boolean;
      };
      const [bids, asks, finals] = await Promise.all([
        contract.queryFilter(contract.filters.BidUpdated(offerId)),
        contract.queryFilter(contract.filters.AskPlaced(offerId)),
        contract.queryFilter(contract.filters.OfferFinalized(offerId)),
      ]);
      const rounds = bids.length + asks.length + finals.length;
      let lastTs = 0;
      for (const ev of [...bids, ...asks, ...finals, e]) {
        const block = await ev.getBlock();
        if (block.timestamp > lastTs) lastTs = block.timestamp;
      }
      views.push({
        offerId: offerId.toString(),
        buyer: o.buyer,
        exclusive: o.exclusive,
        amount: o.amount.toString(),
        bidEth: ethers.formatEther(o.priceWei),
        askEth: o.askPriceWei > 0n ? ethers.formatEther(o.askPriceWei) : null,
        isFinal: o.isFinal,
        expiresAt: new Date(Number(o.expiresAt) * 1000).toISOString(),
        active: o.active,
        rounds,
        lastActivityAt: new Date(lastTs * 1000).toISOString(),
        stalled: o.active && rounds >= 2 && now - lastTs * 1000 > STALL_AFTER_MS,
      });
    }
    views.sort((a, b) => (a.lastActivityAt < b.lastActivityAt ? 1 : -1));
    return { configured: true, offers: views };
  } catch (err) {
    console.warn('[offers] chain read failed:', (err as Error).message);
    return { configured: true, offers: [] };
  }
}
