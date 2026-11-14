import { Request, Response } from 'express';
import { ethers } from 'ethers';
import { prisma } from '../db';
import { config } from '../config';
import { asyncHandler } from '../utils/asyncHandler';
import { HttpError } from '../middleware/errorHandler';

// ---------------------------------------------------------------------------
// Escrow listing registry (Nov 13, 5% fee route). BeatEscrow has no
// fingerprint lookup, so the buy panel finds the active escrow listing
// for a beat here. The producer reports a listing right after list()
// mines; the backend verifies it on-chain (seller + fingerprint +
// active must match) before accepting it — a registry row is never
// taken on the reporter's word alone. No fiat/card data anywhere.
// ---------------------------------------------------------------------------

const ESCROW_ABI = [
  'function listings(uint256 listingId) view returns (address seller, address nft, uint256 tokenId, uint256 amount, uint256 priceWei, bytes32 fingerprint, address buyer, uint64 expiresAt, bool active)',
] as const;

const CHAIN_READ_ABI = [
  'function getBeat(bytes32) view returns (address owner, uint256 timestamp, string metadataURI)',
  'function leaseTokenId(bytes32) view returns (uint256)',
  'function exclusiveTokenId(bytes32) view returns (uint256)',
] as const;

// BeatNFT token-id derivation is pure, but the backend reads it from the
// contract when configured; the pure fallback matches BeatNFT.sol.
function pureTokenId(fingerprint: string, exclusive: boolean): bigint {
  if (!exclusive) return BigInt(fingerprint);
  const packed = ethers.solidityPacked(
    ['string', 'bytes32'],
    ['BeatNFT:exclusive', fingerprint]
  );
  return BigInt(ethers.keccak256(packed));
}

function normalizeFingerprint(fp: string | null | undefined): string | null {
  if (!fp) return null;
  const hex = fp.startsWith('0x') ? fp : `0x${fp}`;
  return /^0x[0-9a-fA-F]{64}$/.test(hex) ? hex.toLowerCase() : null;
}

async function readListingOnChain(listingId: number) {
  if (!config.rpcUrl || !config.beatEscrowAddress) return null;
  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  const escrow = new ethers.Contract(config.beatEscrowAddress, ESCROW_ABI, provider);
  const l = await escrow.listings(listingId);
  return {
    seller: String(l.seller).toLowerCase(),
    nft: String(l.nft).toLowerCase(),
    tokenId: BigInt(l.tokenId),
    amount: Number(l.amount),
    priceWei: BigInt(l.priceWei).toString(),
    fingerprint: String(l.fingerprint).toLowerCase(),
    buyer: String(l.buyer).toLowerCase(),
    expiresAt: new Date(Number(l.expiresAt) * 1000),
    active: Boolean(l.active),
  };
}

function serializeListing(l: {
  id: string;
  beatId: string;
  listingId: number;
  exclusive: boolean;
  amount: number;
  priceWei: string;
  seller: string;
  active: boolean;
  expiresAt: Date;
  createdAt: Date;
}) {
  return {
    id: l.id,
    beatId: l.beatId,
    listingId: l.listingId,
    exclusive: l.exclusive,
    amount: l.amount,
    priceWei: l.priceWei,
    priceEth: ethers.formatEther(BigInt(l.priceWei)),
    seller: l.seller,
    active: l.active,
    expiresAt: l.expiresAt.toISOString(),
    createdAt: l.createdAt.toISOString(),
  };
}

export const reportEscrowListing = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const beatId = String(req.body?.beatId ?? '').trim();
  const listingId = Number(req.body?.listingId);
  const exclusive = req.body?.exclusive === true;
  const amount = Number(req.body?.amount);
  const priceWei = String(req.body?.priceWei ?? '').trim();
  const expiresAtRaw = String(req.body?.expiresAt ?? '').trim();
  if (!beatId) throw new HttpError(400, 'beatId is required');
  if (!Number.isInteger(listingId) || listingId < 1) {
    throw new HttpError(400, 'listingId must be the on-chain escrow listing id');
  }
  if (!Number.isInteger(amount) || amount < 1) throw new HttpError(400, 'amount must be at least 1');
  if (!/^\d+$/.test(priceWei) || BigInt(priceWei) <= 0n) {
    throw new HttpError(400, 'priceWei must be the total lot price in wei');
  }
  const expiresAt = expiresAtRaw ? new Date(expiresAtRaw) : null;
  if (!expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
    throw new HttpError(400, 'expiresAt must be a future date');
  }
  const beat = await prisma.beat.findUnique({ where: { id: beatId } });
  if (!beat) throw new HttpError(404, 'Beat not found');
  if (beat.userId !== userId) {
    throw new HttpError(400, 'Only the beat producer can report an escrow listing for it');
  }
  const fingerprint = normalizeFingerprint(beat.fingerprint);
  if (!fingerprint) throw new HttpError(400, 'Beat has no fingerprint recorded');

  const existing = await prisma.escrowListing.findUnique({ where: { listingId } });
  if (existing) throw new HttpError(409, 'That escrow listing is already registered');

  // On-chain verification (when the escrow contract is configured):
  // seller + fingerprint + active + nft + tokenId + amount + price must
  // all match the report. Without the contract configured the row is
  // refused rather than trusted — the buy panel cannot use it safely.
  if (!config.rpcUrl || !config.beatEscrowAddress) {
    throw new HttpError(400, 'Escrow contract is not configured on the backend — the listing cannot be verified on-chain yet');
  }
  let onChain;
  try {
    onChain = await readListingOnChain(listingId);
  } catch {
    throw new HttpError(400, 'Base RPC was unreachable — the escrow listing could not be verified on-chain. Try again in a minute.');
  }
  if (!onChain) throw new HttpError(400, 'Escrow listing could not be read on-chain');
  if (!onChain.active) throw new HttpError(400, 'That escrow listing is not active on-chain');
  if (onChain.fingerprint !== fingerprint) {
    throw new HttpError(400, 'That escrow listing is for a different beat fingerprint');
  }
  if (config.beatNftAddress && onChain.nft !== config.beatNftAddress.toLowerCase()) {
    throw new HttpError(400, 'That escrow listing is for a different NFT contract');
  }
  if (onChain.amount !== amount || onChain.priceWei !== priceWei) {
    throw new HttpError(400, 'amount / priceWei do not match the on-chain escrow listing');
  }
  // Token id must match the license type (lease vs exclusive).
  let expectedTokenId = pureTokenId(fingerprint, exclusive);
  if (config.beatNftAddress) {
    try {
      const provider = new ethers.JsonRpcProvider(config.rpcUrl);
      const nft = new ethers.Contract(config.beatNftAddress, CHAIN_READ_ABI, provider);
      expectedTokenId = BigInt(
        exclusive ? await nft.exclusiveTokenId(fingerprint) : await nft.leaseTokenId(fingerprint)
      );
    } catch {
      // Fall back to the pure derivation above (matches BeatNFT.sol).
    }
  }
  if (onChain.tokenId !== expectedTokenId) {
    throw new HttpError(400, 'That escrow listing is for the other license type (lease vs exclusive)');
  }
  // Seller must be the beat's registered on-chain owner when the
  // registry is configured, else the reporting user's stored wallet.
  let ownerOk = false;
  if (config.rpcUrl && config.beatRegistryAddress) {
    try {
      const provider = new ethers.JsonRpcProvider(config.rpcUrl);
      const reg = new ethers.Contract(config.beatRegistryAddress, CHAIN_READ_ABI, provider);
      const owner = String((await reg.getBeat(fingerprint)).owner).toLowerCase();
      ownerOk = owner === onChain.seller;
    } catch {
      ownerOk = false;
    }
  }
  if (!ownerOk) {
    const me = await prisma.user.findUnique({ where: { id: userId }, select: { wallet: true } });
    ownerOk = !!me?.wallet && me.wallet.toLowerCase() === onChain.seller;
  }
  if (!ownerOk) {
    throw new HttpError(400, 'The escrow listing seller is not the beat producer');
  }

  const row = await prisma.escrowListing.create({
    data: {
      beatId: beat.id,
      listingId,
      exclusive,
      amount,
      priceWei,
      seller: onChain.seller,
      active: true,
      expiresAt,
    },
  });
  res.status(201).json(serializeListing(row));
});

export const escrowListingsByBeat = asyncHandler(async (req: Request, res: Response) => {
  const beatId = String(req.params.beatId ?? '').trim();
  if (!beatId) throw new HttpError(400, 'beatId is required');
  const beat = await prisma.beat.findUnique({ where: { id: beatId } });
  if (!beat) throw new HttpError(404, 'Beat not found');
  const rows = await prisma.escrowListing.findMany({
    where: { beatId: beat.id, active: true, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  // Best-effort on-chain active re-check: a settled/cancelled listing
  // stops showing even if the DB row is stale. RPC/config failure
  // leaves the DB state as-is — never blocks the buy panel.
  const out: Array<ReturnType<typeof serializeListing>> = [];
  for (const row of rows) {
    let active = row.active;
    if (config.rpcUrl && config.beatEscrowAddress) {
      try {
        const onChain = await readListingOnChain(row.listingId);
        if (onChain && !onChain.active) {
          active = false;
          await prisma.escrowListing.update({
            where: { id: row.id },
            data: { active: false },
          }).catch(() => undefined);
        }
      } catch {
        // Keep the DB row — the chain could not be read right now.
      }
    }
    if (active) out.push(serializeListing(row));
  }
  res.json({ beatId: beat.id, listings: out });
});
