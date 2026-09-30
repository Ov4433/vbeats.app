import { Router } from 'express';
import { stripeWebhook } from '../controllers/transactionsController';

const router = Router();

// Webhooks are called by Stripe, not by users — no bearer auth here.
router.post('/stripe', stripeWebhook);

export default router;
