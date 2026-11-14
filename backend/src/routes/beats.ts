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
  verifyBatch,
  coSignBeat,
  listPendingCoSign,
  beatNftInfo,
  beatOffersInfo,
  recordPlay,
  toggleVote,
  topVotedChart,
} from '../controllers/beatsController';
import { requireAuth, optionalAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { beatCreateSchema, beatUpdateSchema } from '../schemas';

const router = Router();

// Public: play tracking counts anonymous listeners, and the offers feed is
// public negotiation state.
router.post('/:id/play', optionalAuth, recordPlay);
router.get('/:id/offers', beatOffersInfo);
// Read-only batch verification for the feed's lazy per-card checks.
router.post('/verify-batch', optionalAuth, verifyBatch);

// Static paths first — Express matches in order, so these must come before
// '/:id', otherwise "marketplace"/"search" would be treated as a beat id.
router.get('/search', requireAuth, search);
router.get('/marketplace', requireAuth, marketplace);
router.get('/user', requireAuth, getUserBeats);
// Make-a-song co-sign queue (producer's own inbox) — before '/:id'.
router.get('/pending-co-sign', requireAuth, listPendingCoSign);
// Public chart: logged-in callers also get votedByMe, everyone else reads
// it anonymously.
router.get('/top-voted', optionalAuth, topVotedChart);

// Public: beat detail doubles as the NFT token URI (marketplaces fetch it
// without credentials). optionalAuth lets getBeat compute votedByMe.
router.get('/:id', optionalAuth, getBeat);

// Static paths first — Express matches in order, so these must come before
// '/:id', otherwise "marketplace"/"search" would be treated as a beat id.
router.get('/search', requireAuth, search);
router.get('/marketplace', requireAuth, marketplace);
router.get('/user', requireAuth, getUserBeats);
// Public chart: logged-in callers also get votedByMe, everyone else reads
// it anonymously.
router.get('/top-voted', optionalAuth, topVotedChart);

// Public: beat detail doubles as the NFT token URI (marketplaces fetch it
// without credentials). optionalAuth lets getBeat compute votedByMe.
router.get('/:id', optionalAuth, getBeat);

router.use(requireAuth);

router.post('/upload', uploadBeat);
router.get('/', listBeats);
router.post('/', validateBody(beatCreateSchema), createBeat);
router.put('/:id', validateBody(beatUpdateSchema), updateBeat);
router.delete('/:id', deleteBeat);
router.post('/:id/verify', verifyBeat);
router.post('/:id/co-sign', coSignBeat);
router.post('/:id/vote', toggleVote);
router.get('/:id/nft', beatNftInfo);

export default router;
