import { Request, Response } from 'express';
import { prisma } from '../db';
import { asyncHandler } from '../utils/asyncHandler';
import { HttpError } from '../middleware/errorHandler';
import { serializeBeat } from '../utils/serialize';

function serializeTransaction(t: {
  id: string;
  amount: number;
  currency: string;
  type: string;
  status: string;
  stripePaymentId: string | null;
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
    createdAt: t.createdAt.toISOString(),
  };
}

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
