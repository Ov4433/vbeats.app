import { Router } from 'express';
import { listMessages, postMessage } from '../controllers/chatController';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.get('/', listMessages);
router.post('/', requireAuth, postMessage);

export default router;
