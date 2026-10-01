import { Router } from 'express';
import { getProfile, getStats, updateProfile } from '../controllers/usersController';
import { requireAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { profileUpdateSchema } from '../schemas';

const router = Router();

router.use(requireAuth);

router.get('/profile', getProfile);
router.put('/profile', validateBody(profileUpdateSchema), updateProfile);
router.get('/stats', getStats);

export default router;
