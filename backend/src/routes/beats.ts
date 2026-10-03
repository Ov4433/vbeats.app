import { Router } from 'express';
import {
  createBeat,
  deleteBeat,
  getBeat,
  getUserBeats,
  listBeats,
  marketplace,
  search,
  updateBeat,
  uploadBeat,
  verifyBeat,
  beatNftInfo,
} from '../controllers/beatsController';
import { requireAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { beatCreateSchema, beatUpdateSchema } from '../schemas';

const router = Router();

router.use(requireAuth);

// Static paths first — Express matches in order.
router.get('/search', search);
router.get('/marketplace', marketplace);
router.get('/user', getUserBeats);
router.post('/upload', uploadBeat);
router.get('/', listBeats);
router.post('/', validateBody(beatCreateSchema), createBeat);
router.get('/:id', getBeat);
router.put('/:id', validateBody(beatUpdateSchema), updateBeat);
router.delete('/:id', deleteBeat);
router.post('/:id/verify', verifyBeat);
router.get('/:id/nft', beatNftInfo);

export default router;
