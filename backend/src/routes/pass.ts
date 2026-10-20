import { Router, type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { ethers } from 'ethers';
import { z } from 'zod';
import { prisma } from '../db';
import { HttpError } from '../middleware/errorHandler';
import {
  buildStatus,
  checkHolding,
  getOnChainMemberCount,
  getPassState,
  mintClaimPass,
  passConfigured,
} from '../services/passService';

// Volt Pass claim routes — the token-gated buy-in.
//   GET  /v1/pass/status             member counter + showcase gate state
//   GET  /v1/pass/eligibility/:addr VBEATS holding vs the claim threshold
//   GET  /v1/pass/me/:addr           this wallet's pass + member record
//   POST /v1/pass/claim              verify signature + holding, mint the pass
//
// The claimant signs "vbeats-pass-claim:<address>:<bat>:<timestampMs>" with
// their wallet; the signature proves wallet ownership (no account needed)
// and the timestamp keeps replays inside a 5-minute window.

const BATS = ['volt', 'forte', 'bass', 'gwei'] as const;
type Bat = (typeof BATS)[number];

const claimSchema = z.object({
  address: z.string().refine(ethers.isAddress, 'invalid address'),
  bat: z.enum(BATS),
  message: z.string().min(1).max(300),
  signature: z.string().min(1).max(300),
});

function httpError(status: number, message: string): HttpError {
  return new HttpError(status, message);
}

function parseClaimMessage(
  message: string
): { address: string; bat: Bat; timestamp: number } | null {
  const parts = message.split(':');
  if (parts.length !== 4 || parts[0] !== 'vbeats-pass-claim') return null;
  const [, address, bat, ts] = parts;
  if (!ethers.isAddress(address)) return null;
  if (!BATS.includes(bat as Bat)) return null;
  const timestamp = Number(ts);
  if (!Number.isFinite(timestamp)) return null;
  return { address, bat: bat as Bat, timestamp };
}

async function memberCount(): Promise<number> {
  let dbCount = 0;
  try {
    dbCount = await prisma.passClaim.count();
  } catch {
    /* DB unreachable — fall back to the on-chain count */
  }
  const chainCount = await getOnChainMemberCount();
  return Math.max(dbCount, chainCount ?? 0);
}

const router = Router();

router.get('/status', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(buildStatus(await memberCount()));
  } catch (err) {
    next(err);
  }
});

router.get(
  '/eligibility/:address',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { address } = req.params;
      if (!ethers.isAddress(address)) throw httpError(400, 'Invalid address');
      const holding = await checkHolding(ethers.getAddress(address));
      const pass = await getPassState(ethers.getAddress(address)).catch(() => ({
        hasPass: false,
        tokenId: null,
      }));
      res.json({ ...holding, hasPass: pass.hasPass, memberNumber: pass.tokenId });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/me/:address',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { address } = req.params;
      if (!ethers.isAddress(address)) throw httpError(400, 'Invalid address');
      const checksum = ethers.getAddress(address);
      const [record, pass, members] = await Promise.all([
        prisma.passClaim
          .findUnique({ where: { walletAddress: checksum } })
          .catch(() => null),
        getPassState(checksum).catch(() => ({ hasPass: false, tokenId: null })),
        memberCount(),
      ]);
      const status = buildStatus(members);
      res.json({
        hasPass: pass.hasPass,
        memberNumber: pass.tokenId ?? record?.memberNumber ?? null,
        bat: record?.bat ?? null,
        claimedAt: record?.createdAt ?? null,
        showcaseUnlocked: status.showcaseUnlocked,
        members,
        memberGoal: status.memberGoal,
      });
    } catch (err) {
      next(err);
    }
  }
);

const claimLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

router.post(
  '/claim',
  claimLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = claimSchema.safeParse(req.body);
      if (!parsed.success) throw httpError(400, 'Invalid claim request');
      const { address, bat, message, signature } = parsed.data;
      const checksum = ethers.getAddress(address);

      // 1. The signed message must match the request and be fresh.
      const claims = parseClaimMessage(message);
      if (
        !claims ||
        claims.address.toLowerCase() !== address.toLowerCase() ||
        claims.bat !== bat
      ) {
        throw httpError(400, 'Signed message does not match the claim');
      }
      const ageMs = Date.now() - claims.timestamp;
      if (ageMs < -60_000 || ageMs > 5 * 60_000) {
        throw httpError(401, 'Signature expired — sign again');
      }

      // 2. The signature must come from the claiming wallet.
      let recovered: string;
      try {
        recovered = ethers.verifyMessage(message, signature);
      } catch {
        throw httpError(401, 'Invalid signature');
      }
      if (recovered.toLowerCase() !== address.toLowerCase()) {
        throw httpError(401, 'Signature is from a different wallet');
      }

      // 3. Claims only run once the token + pass are wired up.
      if (!passConfigured()) {
        throw httpError(503, 'Claims open at token launch');
      }

      // 4. Already claimed? Return the existing member record.
      const existing = await prisma.passClaim
        .findUnique({ where: { walletAddress: checksum } })
        .catch(() => null);
      const onChain = await getPassState(checksum);
      if (onChain.hasPass) {
        const record =
          existing ??
          (await prisma.passClaim.create({
            data: {
              walletAddress: checksum,
              bat,
              memberNumber: onChain.tokenId ?? 0,
            },
          }));
        const status = buildStatus(await memberCount());
        return res.json({
          claimed: true,
          alreadyClaimed: true,
          memberNumber: record.memberNumber,
          bat: record.bat,
          showcaseUnlocked: status.showcaseUnlocked,
        });
      }

      // 5. The token gate: hold at least the threshold on Robinhood Chain.
      const holding = await checkHolding(checksum);
      if (!holding.eligible) {
        throw httpError(
          403,
          `Hold at least ${holding.threshold} VBEATS to claim — this wallet holds ${holding.balanceFormatted}`
        );
      }

      // 6. Mint (relayer pays the gas) and record the membership.
      const { tokenId, txHash } = await mintClaimPass(checksum);
      const record = await prisma.passClaim.create({
        data: {
          walletAddress: checksum,
          bat,
          memberNumber: tokenId,
          txHash: txHash || null,
        },
      });
      const status = buildStatus(await memberCount());
      return res.json({
        claimed: true,
        alreadyClaimed: false,
        memberNumber: record.memberNumber,
        bat: record.bat,
        txHash,
        showcaseUnlocked: status.showcaseUnlocked,
        members: status.members,
        memberGoal: status.memberGoal,
      });
    } catch (err) {
      return next(err);
    }
  }
);

export default router;
