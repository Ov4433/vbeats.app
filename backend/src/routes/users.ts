import { Router } from 'express';
import {
  getProfile,
  getPublicProfile,
  getStats,
  linkSolana,
  unlinkSolana,
  updateProfile,
} from '../controllers/usersController';
import { optionalAuth, requireAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { linkSolanaSchema, profileUpdateSchema } from '../schemas';

const router = Router();

// Public creator page data — registered before the auth wall below.
router.get('/:usernameOrId/public', optionalAuth, getPublicProfile);

router.use(requireAuth);

router.get('/profile', getProfile);
router.put('/profile', validateBody(profileUpdateSchema), updateProfile);
router.get('/stats', getStats);
router.post('/link-solana', validateBody(linkSolanaSchema), linkSolana);
router.post('/unlink-solana', unlinkSolana);

export default router;
