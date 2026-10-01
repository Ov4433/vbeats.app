import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { config } from '../config';

const router = Router();

const STUDIO_NAME = 'Verified Beats Studio';

function brandUrl(filename: string): string | null {
  const full = path.join(config.brandDir, filename);
  if (!fs.existsSync(full)) return null;
  return `${config.apiBaseUrl}/brand/${filename}`;
}

/**
 * GET /v1/brand — public brand info for the Verified Beats Studio client.
 * { name, logo, mascot, profile, banner } — null for any missing asset file.
 */
router.get('/', (_req, res) => {
  res.json({
    name: STUDIO_NAME,
    logo: brandUrl('logo.png'),
    mascot: brandUrl('mascot.webp'),
    profile: brandUrl('mascot-profile.webp'),
    banner: brandUrl('banner.webp'),
  });
});

export default router;
