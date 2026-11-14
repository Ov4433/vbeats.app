import { Router } from 'express';
import {
  createFeatureRequest,
  listFeatureInbox,
  listFeatureSent,
  respondFeatureRequest,
} from '../controllers/featuresController';
import { requireAuth } from '../middleware/auth';

const router = Router();

// Feature / co-sign requests (Nov 13): a singer asks the parent beat's
// producer to feature their song. All routes need a signed-in user.
router.use(requireAuth);

router.post('/', createFeatureRequest);
router.get('/inbox', listFeatureInbox);
router.get('/sent', listFeatureSent);
router.post('/:id/respond', respondFeatureRequest);

export default router;
