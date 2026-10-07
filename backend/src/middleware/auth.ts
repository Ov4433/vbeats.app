import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { prisma } from '../db';

export interface AuthUser {
  id: string;
  email: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

interface AccessTokenPayload {
  sub: string;
  email: string;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: { message: 'Missing bearer token' } });
    return;
  }
  const token = header.slice('Bearer '.length);
  try {
    const payload = jwt.verify(token, config.jwtSecret) as AccessTokenPayload;
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch {
    res.status(401).json({ error: { message: 'Invalid or expired token' } });
  }
}

/**
 * Attach req.user when a valid Bearer token is present; otherwise continue
 * anonymously. For public endpoints (e.g. play tracking) where logged-in
 * listeners get attributed plays and everyone else counts as anonymous.
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(
        header.slice('Bearer '.length),
        config.jwtSecret
      ) as AccessTokenPayload;
      req.user = { id: payload.sub, email: payload.email };
    } catch {
      // Bad token on a public endpoint: treat as anonymous, don't 401.
    }
  }
  next();
}

export async function loadUser(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: { message: 'Not authenticated' } });
    return;
  }
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) {
    res.status(401).json({ error: { message: 'User no longer exists' } });
    return;
  }
  next();
}
