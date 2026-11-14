import { ethers } from 'ethers';
import { config } from '../config';

// Read-only BeatNFT listing info: what a buyer can actually buy right now.
// `buy()` on-chain only works when the producer has set a price AND stocked
// licenses in the contract — so the buy panel must read both before it
// offers a one-click buy, instead of assuming the beat's display price is
// buyable. Never throws: any misconfiguration returns configured=false
// and callers fall back to the offer flow.
const BEAT_NFT_ABI = [
  'function licensePrice(uint256 tokenId) view returns (uint256)',
  'function balanceOf(address account, uint256 tokenId) view returns (uint256)',
  'function royaltyBps() view returns (uint96)',
  'function leaseTokenId(bytes32 fingerprint) view returns (uint256)',
  'function exclusiveTokenId(bytes32 fingerprint) view returns (uint256)',
] as const;

export interface LicenseListing {
  priceWei: string;
  priceEth: string;
  stock: number;
}

export interface NftListing {
  configured: boolean;
  lease: LicenseListing | null;
  exclusive: LicenseListing | null;
  royaltyBps: number | null;
}

function normalizeFingerprint(fp: string): string | null {
  const hex = fp.startsWith('0x') ? fp : `0x${fp}`;
  return /^0x[0-9a-fA-F]{64}$/.test(hex) ? hex : null;
}

export async function getNftListing(
  fingerprint: string | null
): Promise<NftListing> {
  const empty: NftListing = {
    configured: false,
    lease: null,
    exclusive: null,
    royaltyBps: null,
  };
  if (!config.rpcUrl || !config.beatNftAddress || !fingerprint) return empty;
  const fp = normalizeFingerprint(fingerprint);
  if (!fp) return { ...empty, configured: true };
  try {
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const nft = new ethers.Contract(config.beatNftAddress, BEAT_NFT_ABI, provider);
    const [leaseId, exclusiveId] = await Promise.all([
      nft.leaseTokenId(fp) as Promise<bigint>,
      nft.exclusiveTokenId(fp) as Promise<bigint>,
    ]);
    const [leasePrice, exclusivePrice, leaseStock, exclusiveStock, royaltyBps] =
      await Promise.all([
        nft.licensePrice(leaseId) as Promise<bigint>,
        nft.licensePrice(exclusiveId) as Promise<bigint>,
        nft.balanceOf(config.beatNftAddress, leaseId) as Promise<bigint>,
        nft.balanceOf(config.beatNftAddress, exclusiveId) as Promise<bigint>,
        nft.royaltyBps() as Promise<bigint>,
      ]);
    const listing = (priceWei: bigint, stock: bigint): LicenseListing | null => {
      // Listed means a price is set AND the contract holds stock to sell.
      if (priceWei <= 0n || stock <= 0n) return null;
      return {
        priceWei: priceWei.toString(),
        priceEth: ethers.formatEther(priceWei),
        stock: Number(stock),
      };
    };
    return {
      configured: true,
      lease: listing(leasePrice, leaseStock),
      exclusive: listing(exclusivePrice, exclusiveStock),
      royaltyBps: Number(royaltyBps),
    };
  } catch (err) {
    console.warn('[nft] listing read failed:', (err as Error).message);
    return { ...empty, configured: true };
  }
}
