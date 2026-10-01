import { Router } from 'express';
import {
  getTransaction,
  listTransactions,
} from '../controllers/transactionsController';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

router.get('/', listTransactions);
router.get('/:id', getTransaction);

export default router;
