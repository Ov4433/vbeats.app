import { Router, type Request } from 'express';
import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { publicBaseUrl } from '../utils/baseUrl';

const router = Router();

const STUDIO_NAME = 'Verified Beats Studio';

function brandUrl(req: Request, filename: string): string | null {
  const full = path.join(config.brandDir, filename);
  if (!fs.existsSync(full)) return null;
  return `${publicBaseUrl(req)}/brand/${filename}`;
}

/**
 * GET /v1/brand — public brand info for the Verified Beats Studio client.
 * { name, logo, mascot, profile, banner } — null for any missing asset file.
 */
router.get('/', (req, res) => {
  res.json({
    name: STUDIO_NAME,
    logo: brandUrl(req, 'logo.png'),
    mascot: brandUrl(req, 'mascot.webp'),
    profile: brandUrl(req, 'mascot-profile.webp'),
    banner: brandUrl(req, 'banner.webp'),
  });
});

export default router;
