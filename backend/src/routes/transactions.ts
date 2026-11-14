import { Router } from 'express';
import {
  getTransaction,
  listTransactions,
  recordPurchase,
  getDashboard,
} from '../controllers/transactionsController';
import { requireAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { z } from 'zod';

const router = Router();

router.use(requireAuth);

// Money path (Nov 13): record an on-chain BeatNFT.buy() + producer
// dashboard. '/dashboard' must come before '/:id'.
router.post('/', validateBody(z.object({
  beatId: z.string().min(1),
  txHash: z.string().min(1),
  amountEth: z.number().positive().optional(),
  amount: z.number().positive().optional(),
  licenseKind: z.string().optional(),
  channel: z.string().optional(),
}).passthrough()), recordPurchase);
router.get('/dashboard', getDashboard);

router.get('/', listTransactions);
router.get('/:id', getTransaction);

export default router;
