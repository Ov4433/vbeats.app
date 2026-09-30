import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { prisma } from '../db';
import { serializeUser } from '../utils/serialize';

export interface TokenPair {
  token: string;
  refreshToken: string;
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function signAccessToken(userId: string, email: string): string {
  return jwt.sign({ sub: userId, email }, config.jwtSecret, {
    expiresIn: config.jwtAccessTtl,
  } as jwt.SignOptions);
}

export async function issueTokenPair(userId: string, email: string): Promise<TokenPair> {
  const token = signAccessToken(userId, email);
  const refreshToken = crypto.randomBytes(48).toString('hex');
  const expiresAt = new Date(
    Date.now() + config.refreshTtlDays * 24 * 60 * 60 * 1000
  );
  await prisma.refreshToken.create({
    data: { tokenHash: hashToken(refreshToken), userId, expiresAt },
  });
  return { token, refreshToken };
}

/** Rotate a refresh token: returns a new pair, or null if invalid/expired. */
export async function rotateRefreshToken(
  refreshToken: string
): Promise<(TokenPair & { userId: string; email: string }) | null> {
  const record = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(refreshToken) },
    include: { user: true },
  });
  if (!record || record.expiresAt < new Date()) {
    if (record) {
      await prisma.refreshToken.delete({ where: { id: record.id } });
    }
    return null;
  }
  await prisma.refreshToken.delete({ where: { id: record.id } });
  const pair = await issueTokenPair(record.userId, record.user.email);
  return { ...pair, userId: record.userId, email: record.user.email };
}

export async function revokeUserTokens(userId: string): Promise<void> {
  await prisma.refreshToken.deleteMany({ where: { userId } });
}

export function authResponse(user: Parameters<typeof serializeUser>[0], pair: TokenPair) {
  return { ...pair, user: serializeUser(user) };
}
