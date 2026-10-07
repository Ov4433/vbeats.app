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
  recordPlay,
} from '../controllers/beatsController';
import { requireAuth, optionalAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { beatCreateSchema, beatUpdateSchema } from '../schemas';

const router = Router();

// Public: beat detail doubles as the NFT token URI (marketplaces fetch it
// without credentials), and play tracking counts anonymous listeners.
router.post('/:id/play', optionalAuth, recordPlay);
router.get('/:id', getBeat);

router.use(requireAuth);

// Static paths first — Express matches in order.
router.get('/search', search);
router.get('/marketplace', marketplace);
router.get('/user', getUserBeats);
router.post('/upload', uploadBeat);
router.get('/', listBeats);
router.post('/', validateBody(beatCreateSchema), createBeat);
router.put('/:id', validateBody(beatUpdateSchema), updateBeat);
router.delete('/:id', deleteBeat);
router.post('/:id/verify', verifyBeat);
router.get('/:id/nft', beatNftInfo);

export default router;
