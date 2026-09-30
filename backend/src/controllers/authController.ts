import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../db';
import { asyncHandler } from '../utils/asyncHandler';
import { serializeUser } from '../utils/serialize';
import { HttpError } from '../middleware/errorHandler';
import {
  authResponse,
  issueTokenPair,
  rotateRefreshToken,
  revokeUserTokens,
} from '../services/tokenService';

export const signup = asyncHandler(async (req: Request, res: Response) => {
  const { email, password, wallet } = req.body as {
    email: string;
    password: string;
    username?: string;
    name?: string;
    wallet?: string;
  };
  // Demo signup form sends `name`; the mobile app sends `username`.
  const username = (req.body.username ?? req.body.name ?? '').trim();

  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, { username }] },
  });
  if (existing) {
    throw new HttpError(409, 'Email or username already taken');
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email, username, passwordHash, wallet: wallet ?? null },
  });
  const pair = await issueTokenPair(user.id, user.email);
  res.status(201).json(authResponse(user, pair));
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body as { email: string; password: string };
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new HttpError(401, 'Invalid email or password');
  }
  const pair = await issueTokenPair(user.id, user.email);
  res.json(authResponse(user, pair));
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  if (req.user) {
    await revokeUserTokens(req.user.id);
  }
  res.status(200).json({ ok: true });
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken } = req.body as { refreshToken: string };
  const rotated = await rotateRefreshToken(refreshToken);
  if (!rotated) {
    throw new HttpError(401, 'Invalid or expired refresh token');
  }
  const user = await prisma.user.findUnique({ where: { id: rotated.userId } });
  if (!user) {
    throw new HttpError(401, 'User no longer exists');
  }
  res.json(authResponse(user, { token: rotated.token, refreshToken: rotated.refreshToken }));
});

export const verify = asyncHandler(async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) {
    throw new HttpError(401, 'Invalid token');
  }
  res.status(200).json({ valid: true, user: serializeUser(user) });
});

/** Compatibility with the mobile app's GET /auth/me call. */
export const me = asyncHandler(async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) {
    throw new HttpError(401, 'Invalid token');
  }
  res.json(serializeUser(user));
});
