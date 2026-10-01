import { Request, Response } from 'express';
import { prisma } from '../db';
import { asyncHandler } from '../utils/asyncHandler';
import { serializeUser } from '../utils/serialize';
import { HttpError } from '../middleware/errorHandler';

export const getProfile = asyncHandler(async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) throw new HttpError(404, 'User not found');
  res.json(serializeUser(user));
});

export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
  const { username, wallet } = req.body as {
    username?: string;
    wallet?: string | null;
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
