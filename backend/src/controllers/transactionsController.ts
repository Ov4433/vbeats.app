import { Request, Response } from 'express';
import { ethers } from 'ethers';
import { prisma } from '../db';
import { config } from '../config';
import { asyncHandler } from '../utils/asyncHandler';
import { HttpError } from '../middleware/errorHandler';
import { serializeBeat } from '../utils/serialize';
import { beatOffers } from '../services/offerService';

function serializeTransaction(t: {
  id: string;
  amount: number;
  currency: string;
  type: string;
  status: string;
  stripePaymentId: string | null;
  txHash?: string | null;
  licenseKind?: string | null;
  createdAt: Date;
  beatId: string;
  buyerId: string;
  sellerId: string;
  beat?: { id: string } | null;
}) {
  return {
    id: t.id,
    beatId: t.beatId,
    buyerId: t.buyerId,
    sellerId: t.sellerId,
    amount: t.amount,
    currency: t.currency,
    type: t.type,
    status: t.status,
    stripePaymentId: t.stripePaymentId,
    txHash: t.txHash ?? null,
    licenseKind: t.licenseKind ?? null,
    createdAt: t.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// POST /v1/transactions — record an on-chain license purchase (money path,
// Nov 13). The buyer calls this right after BeatNFT.buy() mines, with the
// tx hash as the receipt. The backend checks the receipt on Base when it
// can: a mined receipt to the BeatNFT contract with status 1 is
// 'completed'; if the receipt cannot be checked yet (not mined / RPC
// down / contract not configured) the row is 'pending' — never faked as
// completed. A duplicate tx hash is a 409. Crypto-native only: amount is
// ETH, currency is always 'ETH', no fiat/card fields are accepted.
// ---------------------------------------------------------------------------
export const recordPurchase = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const beatId = String(req.body?.beatId ?? '').trim();
  const txHash = String(req.body?.txHash ?? '').trim();
  const amountEth = Number(req.body?.amountEth ?? req.body?.amount);
  const licenseKind = String(req.body?.licenseKind ?? 'lease').toLowerCase();
  if (!beatId) throw new HttpError(400, 'beatId is required');
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    throw new HttpError(400, 'txHash must be a transaction hash (0x + 64 hex chars)');
  }
  if (!Number.isFinite(amountEth) || amountEth <= 0) {
    throw new HttpError(400, 'amountEth must be a positive number of ETH');
  }
  if (licenseKind !== 'lease' && licenseKind !== 'exclusive') {
    throw new HttpError(400, "licenseKind must be 'lease' or 'exclusive'");
  }
  const beat = await prisma.beat.findUnique({ where: { id: beatId } });
  if (!beat) throw new HttpError(404, 'Beat not found');
  if (beat.userId === userId) {
    throw new HttpError(400, 'You cannot buy your own beat');
  }
  const existing = await prisma.transaction.findFirst({ where: { txHash } });
  if (existing) throw new HttpError(409, 'This purchase is already recorded');

  // Receipt check on Base: mined + successful + sent to the BeatNFT
  // contract = completed. Anything else stays pending — the on-chain tx
  // itself is still the proof, and the dashboard only counts completed.
  let status = 'pending';
  let receiptNote: string | null = 'Receipt could not be checked yet';
  if (config.rpcUrl && config.beatNftAddress) {
    try {
      const provider = new ethers.JsonRpcProvider(config.rpcUrl);
      const receipt = await provider.getTransactionReceipt(txHash);
      if (!receipt) {
        receiptNote = 'Transaction not mined yet — check back in a minute';
      } else if (receipt.status !== 1) {
        throw new HttpError(400, 'That transaction failed on-chain — no license was bought');
      } else if (receipt.to?.toLowerCase() !== config.beatNftAddress.toLowerCase()) {
        throw new HttpError(400, 'That transaction was not sent to the BeatNFT contract');
      } else {
        status = 'completed';
        receiptNote = null;
      }
    } catch (err) {
      if (err instanceof HttpError) throw err;
      // RPC down — record as pending rather than failing the purchase.
      receiptNote = 'Base RPC was unreachable when checking — the transaction itself is still the proof';
    }
  }

  const t = await prisma.transaction.create({
    data: {
      beatId: beat.id,
      buyerId: userId,
      sellerId: beat.userId,
      amount: amountEth,
      currency: 'ETH',
      type: 'license',
      status,
      txHash,
      licenseKind,
    } as any,
    include: { beat: true },
  });
  res.status(201).json({
    ...serializeTransaction(t),
    beat: t.beat ? serializeBeat(t.beat) : null,
    receiptNote,
  });
});

// ---------------------------------------------------------------------------
// GET /v1/transactions/dashboard — producer dashboard (money path, Nov 13).
// Earnings come ONLY from completed, currency='ETH' sales — the on-chain
// license purchases recorded above. Legacy USD rows (pre-crypto
// transactions) are counted separately and never mixed into the ETH
// total. Pending offers are read live from the BeatOffers contract for
// the producer's own beats. If the chain cannot be read, offers come
// back empty with offersUnavailable=true — never invented.
// ---------------------------------------------------------------------------
export const getDashboard = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const [myBeats, sales, purchases, legacyCount, pendingFeatures] = await Promise.all([
    prisma.beat.findMany({
      where: { userId },
      select: { id: true, title: true, fingerprint: true },
      take: 50,
    }),
    prisma.transaction.findMany({
      where: { sellerId: userId, currency: 'ETH', status: 'completed' },
      include: { beat: { select: { id: true, title: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.transaction.findMany({
      where: { buyerId: userId },
      include: { beat: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    prisma.transaction.count({ where: { sellerId: userId, currency: { not: 'ETH' } } }),
    prisma.featureRequest.count({ where: { producerId: userId, status: 'pending' } }),
  ]);

  const earningsEth = sales.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  const perBeat: Record<string, { beatId: string; title: string; sales: number; eth: number }> = {};
  for (const t of sales) {
    const key = t.beatId;
    const row = perBeat[key] ?? { beatId: key, title: t.beat?.title ?? 'Beat', sales: 0, eth: 0 };
    row.sales += 1;
    row.eth += Number(t.amount) || 0;
    perBeat[key] = row;
  }

  // Pending offers on MY beats, read live from the BeatOffers contract.
  let pendingOffers: Array<{
    beatId: string; beatTitle: string; offerId: string; bidEth: string;
    buyer: string; expiresAt: string; exclusive: boolean; amount: string;
  }> = [];
  let offersUnavailable = false;
  for (const b of myBeats) {
    if (!b.fingerprint) continue;
    try {
      const { offers } = await beatOffers(b.fingerprint);
      for (const o of offers.filter((x) => x.active)) {
        pendingOffers.push({
          beatId: b.id, beatTitle: b.title, offerId: o.offerId,
          bidEth: o.bidEth, buyer: o.buyer, expiresAt: o.expiresAt,
          exclusive: o.exclusive, amount: o.amount,
        });
      }
    } catch {
      offersUnavailable = true;
    }
  }
  pendingOffers.sort((a, b) => (a.expiresAt < b.expiresAt ? -1 : 1));

  res.json({
    beatsCount: myBeats.length,
    earningsEth,
    salesCount: sales.length,
    perBeat: Object.values(perBeat).sort((a, b) => b.eth - a.eth),
    purchases: purchases.map((t) => ({
      ...serializeTransaction(t),
      beat: t.beat ? serializeBeat(t.beat) : null,
    })),
    pendingOffers,
    offersUnavailable,
    pendingFeatures,
    legacySalesCount: legacyCount,
  });
});

export const listTransactions = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const page = Math.max(1, Number(req.query.page ?? 1) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20) || 20));
  const where = { OR: [{ buyerId: userId }, { sellerId: userId }] };
  const [total, transactions] = await Promise.all([
    prisma.transaction.count({ where }),
    prisma.transaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: { beat: true },
    }),
  ]);
  res.json({
    transactions: transactions.map((t) => ({
      ...serializeTransaction(t),
      beat: t.beat ? serializeBeat(t.beat) : null,
    })),
    total,
    page,
    limit,
  });
});

export const getTransaction = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const t = await prisma.transaction.findUnique({
    where: { id: req.params.id },
    include: { beat: true },
  });
  if (!t) throw new HttpError(404, 'Transaction not found');
  if (t.buyerId !== userId && t.sellerId !== userId) {
    throw new HttpError(403, 'Not your transaction');
  }
  res.json({
    ...serializeTransaction(t),
    beat: t.beat ? serializeBeat(t.beat) : null,
  });
});

/**
 * Stripe webhook stub: logs the event and acknowledges.
 * Signature verification + fulfillment get wired up when STRIPE_WEBHOOK_SECRET is set.
 */
export const stripeWebhook = asyncHandler(async (req: Request, res: Response) => {
  const eventType =
    (req.body as { type?: string })?.type ?? 'unknown';
  console.log(`[stripe] webhook received: ${eventType}`);
  res.status(200).json({ received: true });
});
