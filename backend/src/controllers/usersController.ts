import { Request, Response } from 'express';
import type { User } from '@prisma/client';
import { prisma } from '../db';
import { asyncHandler } from '../utils/asyncHandler';
import { serializeUser, serializeBeat } from '../utils/serialize';
import { voteTotals, votedBeatIds } from '../services/voteService';
import {
  assertAddressAvailable,
  verifyLinkSignature,
} from '../services/solanaService';
import { HttpError } from '../middleware/errorHandler';

/**
 * Link a Solana wallet (auth) — POST /v1/users/link-solana.
 * Body: { address, signature, message } from schemas.linkSolanaSchema.
 * The signature must verify against the server-specified message for
 * this account (see solanaService), and the address must not already be
 * linked to a different account.
 */
export const linkSolana = asyncHandler(async (req: Request, res: Response) => {
  const { address, signature, message } = req.body as {
    address: string;
    signature: string;
    message: string;
  };
  const userId = req.user!.id;
  if (!verifyLinkSignature(userId, { address, signature, message })) {
    throw new HttpError(401, 'Signature does not verify for this wallet and account');
  }
  if (!(await assertAddressAvailable(address, userId))) {
    throw new HttpError(409, 'That Solana wallet is already linked to another account');
  }
  const user = await prisma.user.update({
    where: { id: userId },
    data: { solanaAddress: address },
  });
  res.json(serializeUser(user));
});

/** Unlink the Solana wallet (auth) — POST /v1/users/unlink-solana. */
export const unlinkSolana = asyncHandler(async (req: Request, res: Response) => {
  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data: { solanaAddress: null },
  });
  res.json(serializeUser(user));
});

/**
 * Public creator profile — GET /v1/users/:usernameOrId/public.
 * ONLY public data: username, home bat, pass member number, the creator's
 * beats (with vote totals), and lifetime totals. No email, no account
 * wallet (the EVM wallet stays private; producerAddress already appears
 * per-beat via the chain data elsewhere, not from this endpoint). The
 * linked Solana address IS included once the user links one — linking is
 * an explicit public act and the creator page shows Solana creations.
 * The backend has no collab records (collabs live on-chain in the
 * CollabRegistry contract), so none are returned here.
 */
export const getPublicProfile = asyncHandler(async (req: Request, res: Response) => {
  const { usernameOrId } = req.params;
  const found = await prisma.user.findFirst({
    where: { OR: [{ username: usernameOrId }, { id: usernameOrId }] },
  });
  if (!found) throw new HttpError(404, 'Creator not found');
  const { user, bat } = await resolveUserBat(found);

  const claim = user.wallet
    ? await prisma.passClaim.findFirst({
        where: { walletAddress: { equals: user.wallet, mode: 'insensitive' } },
      })
    : null;

  const beats = await prisma.beat.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
  });
  const beatIds = beats.map((b) => b.id);
  const [totals, voted, plays, votesAgg] = await Promise.all([
    voteTotals(beatIds),
    req.user ? votedBeatIds(req.user.id, beatIds) : Promise.resolve(new Set<string>()),
    prisma.play.count({ where: { beat: { userId: user.id } } }),
    prisma.vote.aggregate({
      where: { beat: { userId: user.id } },
      _sum: { weight: true },
      _count: { id: true },
    }),
  ]);

  res.json({
    id: user.id,
    username: user.username,
    bat,
    memberNumber: claim?.memberNumber ?? null,
    solanaAddress: user.solanaAddress ?? null,
    createdAt: user.createdAt.toISOString(),
    beats: beats.map((b) => ({
      ...serializeBeat(b),
      votes: totals.get(b.id) ?? { totalWeight: 0, count: 0 },
      votedByMe: voted.has(b.id),
    })),
    totals: {
      beats: beats.length,
      plays,
      votesReceived: votesAgg._sum.weight ?? 0,
      voteCount: votesAgg._count.id,
    },
  });
});

/**
 * Demo profile-stats shape: { beats, sales, earnings }.
 * A user's home bat. The explicit profile choice (User.bat) wins; until one
 * is set, it defaults from the bat picked in the Volt Pass claim flow —
 * PassClaim is keyed by wallet address, and the claim stores the
 * checksummed form while User.wallet is client-supplied, so the match is
 * case-insensitive. A claim-derived default is written back to User.bat
 * the first time it is resolved, so the choice is stable afterwards.
 * Returns the (possibly updated) user plus the effective bat.
 */
export async function resolveUserBat(user: User): Promise<{ user: User; bat: string | null }> {
  if (user.bat) return { user, bat: user.bat };
  if (!user.wallet) return { user, bat: null };
  const claim = await prisma.passClaim.findFirst({
    where: { walletAddress: { equals: user.wallet, mode: 'insensitive' } },
  });
  if (!claim) return { user, bat: null };
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { bat: claim.bat },
  });
  return { user: updated, bat: claim.bat };
}

export const getProfile = asyncHandler(async (req: Request, res: Response) => {
  const found = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!found) throw new HttpError(404, 'User not found');
  const { user } = await resolveUserBat(found);
  res.json(serializeUser(user));
});

export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
  const { username, wallet, bat } = req.body as {
    username?: string;
    wallet?: string | null;
    bat?: string | null;
  };
  if (username) {
    const taken = await prisma.user.findFirst({
      where: { username, NOT: { id: req.user!.id } },
    });
    if (taken) throw new HttpError(409, 'Username already taken');
  }
  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data: {
      ...(username ? { username } : {}),
      ...(wallet !== undefined ? { wallet } : {}),
      ...(bat !== undefined ? { bat } : {}),
    },
  });
  res.json(serializeUser(user));
});

/**
 * Demo profile-stats shape: { beats, sales, earnings }.
 * beats = beats uploaded by the user; sales = licenses sold; earnings = USD earned.
 */
export const getStats = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const [beats, sales, earnings] = await Promise.all([
    prisma.beat.count({ where: { userId } }),
    prisma.transaction.count({ where: { sellerId: userId, status: 'completed' } }),
    prisma.transaction.aggregate({
      where: { sellerId: userId, status: 'completed' },
      _sum: { amount: true },
    }),
  ]);
  res.json({
    beats,
    sales,
    earnings: Number((earnings._sum.amount ?? 0).toFixed(2)),
  });
});
