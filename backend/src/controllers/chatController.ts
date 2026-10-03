import { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../db';
import { asyncHandler } from '../utils/asyncHandler';
import { HttpError } from '../middleware/errorHandler';

const postSchema = z.object({
  body: z.string().trim().min(1).max(500),
});

function serialize(m: {
  id: string;
  body: string;
  createdAt: Date;
  user: { username: string };
}) {
  return {
    id: m.id,
    body: m.body,
    username: m.user.username,
    createdAt: m.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// GET /v1/chat — recent messages, newest last. Public (reading is free).
// Query: limit (default 50, max 100), before (message id for paging back).
// ---------------------------------------------------------------------------
export const listMessages = asyncHandler(async (req: Request, res: Response) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
  const before = typeof req.query.before === 'string' ? req.query.before : null;
  let beforeDate: Date | undefined;
  if (before) {
    const anchor = await prisma.chatMessage.findUnique({ where: { id: before } });
    if (anchor) beforeDate = anchor.createdAt;
  }
  const rows = await prisma.chatMessage.findMany({
    where: beforeDate ? { createdAt: { lt: beforeDate } } : undefined,
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { user: { select: { username: true } } },
  });
  res.json({ messages: rows.reverse().map(serialize) });
});

// ---------------------------------------------------------------------------
// POST /v1/chat — post a message. Auth required (keeps drive-by spam out).
// ---------------------------------------------------------------------------
export const postMessage = [
  rateLimit({
    windowMs: 60 * 1000,
    max: 20, // 20 messages/minute per IP
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { message: 'Slow down — too many messages.' } },
  }),
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = postSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'Message must be 1–500 characters.');
    }
    const msg = await prisma.chatMessage.create({
      data: { body: parsed.data.body, userId: req.user!.id },
      include: { user: { select: { username: true } } },
    });
    res.status(201).json(serialize(msg));
  }),
];
