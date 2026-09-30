import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  login,
  logout,
  me,
  refresh,
  signup,
  verify,
} from '../controllers/authController';
import { requireAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { loginSchema, refreshSchema, signupSchema } from '../schemas';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { message: 'Too many auth attempts, try again later' } },
});

router.post('/signup', authLimiter, validateBody(signupSchema), signup);
router.post('/login', authLimiter, validateBody(loginSchema), login);
router.post('/refresh', validateBody(refreshSchema), refresh);
router.post('/logout', requireAuth, logout);
router.post('/verify', requireAuth, verify);
// Compatibility with the mobile app's GET /auth/me call.
router.get('/me', requireAuth, me);

export default router;
