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
  beatOffersInfo,
  recordPlay,
} from '../controllers/beatsController';
import { requireAuth, optionalAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { beatCreateSchema, beatUpdateSchema } from '../schemas';

const router = Router();

// Public: play tracking counts anonymous listeners, and the offers feed is
// public negotiation state.
router.post('/:id/play', optionalAuth, recordPlay);
router.get('/:id/offers', beatOffersInfo);

// Static paths first — Express matches in order, so these must come before
// '/:id', otherwise "marketplace"/"search" would be treated as a beat id.
router.get('/search', requireAuth, search);
router.get('/marketplace', requireAuth, marketplace);
router.get('/user', requireAuth, getUserBeats);

// Public: beat detail doubles as the NFT token URI (marketplaces fetch it
// without credentials).
router.get('/:id', getBeat);

router.use(requireAuth);

router.post('/upload', uploadBeat);
router.get('/', listBeats);
router.post('/', validateBody(beatCreateSchema), createBeat);
router.put('/:id', validateBody(beatUpdateSchema), updateBeat);
router.delete('/:id', deleteBeat);
router.post('/:id/verify', verifyBeat);
router.get('/:id/nft', beatNftInfo);

export default router;
