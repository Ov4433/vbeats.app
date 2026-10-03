import type { Request } from 'express';
import { config } from '../config';

/**
 * Public base URL for this API (used for brand asset links, NFT metadata
 * URIs, etc.). Prefers the configured API_BASE_URL, but when that is still
 * the localhost default (e.g. API_BASE_URL was never set in the Render
 * dashboard) it derives the public URL from the incoming request's
 * forwarded headers, so links never point at localhost in production.
 */
export function publicBaseUrl(req: Request): string {
  const configured = config.apiBaseUrl;
  if (!/localhost|127\.0\.0\.1/.test(configured)) return configured;
  const proto =
    req.get('x-forwarded-proto')?.split(',')[0]?.trim() || req.protocol;
  const host =
    req.get('x-forwarded-host')?.split(',')[0]?.trim() || req.get('host');
  return host ? `${proto}://${host}` : configured;
}
