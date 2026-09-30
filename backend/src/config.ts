import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  apiBaseUrl: process.env.API_BASE_URL ?? 'http://localhost:4000',
  jwtSecret: process.env.JWT_SECRET ?? 'dev-only-secret-change-me',
  jwtAccessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
  refreshTtlDays: Number(process.env.JWT_REFRESH_TTL_DAYS ?? 30),
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:19006,http://localhost:8081')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  uploadDir: process.env.UPLOAD_DIR ?? 'uploads',
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB ?? 50),
  // Brand assets live at the repo root (../brand relative to backend/).
  // Override with BRAND_DIR when the layout differs.
  brandDir:
    process.env.BRAND_DIR ?? path.resolve(__dirname, '..', '..', 'brand'),
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
  rpcUrl: process.env.RPC_URL ?? '',
  beatRegistryAddress: process.env.BEAT_REGISTRY_ADDRESS ?? '',
};

export function assertSecretsInProduction() {
  if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET must be set in production');
  }
}

// Keep tree-shakeable reference so TS doesn't flag the import as unused.
void required;
