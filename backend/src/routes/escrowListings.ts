import { Router } from 'express';
import {
  reportEscrowListing,
  escrowListingsByBeat,
} from '../controllers/escrowListingsController';
import { requireAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { z } from 'zod';

const router = Router();

// Escrow listing registry (Nov 13, 5% fee route): POST is producer-only
// and verified on-chain; GET is public so the buy panel can find the
// active escrow listing for a beat without signing in.
router.post(
  '/',
  requireAuth,
  validateBody(
    z
      .object({
        beatId: z.string().min(1),
        listingId: z.number().int().min(1),
        exclusive: z.boolean().optional(),
        amount: z.number().int().min(1),
        priceWei: z.string().min(1),
        expiresAt: z.string().min(1),
      })
      .passthrough()
  ),
  reportEscrowListing
);
router.get('/by-beat/:beatId', escrowListingsByBeat);

export default router;
