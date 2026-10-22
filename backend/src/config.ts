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
  // --- Durable audio storage (Cloudflare R2, S3-compatible) ---
  // When all five are set, uploads go to R2 and beats store the public URL.
  // When unset, uploads fall back to the local disk (dev only — Render's
  // disk is ephemeral and wipes on redeploy).
  r2AccountId: process.env.R2_ACCOUNT_ID ?? '',
  r2AccessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
  r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
  r2Bucket: process.env.R2_BUCKET ?? '',
  r2PublicBaseUrl: (process.env.R2_PUBLIC_BASE_URL ?? '').replace(/\/+$/, ''),
  // Brand assets live at the repo root (../brand relative to backend/).
  // Override with BRAND_DIR when the layout differs.
  brandDir:
    process.env.BRAND_DIR ?? path.resolve(__dirname, '..', '..', 'brand'),
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
  rpcUrl: process.env.RPC_URL ?? '',
  beatRegistryAddress: process.env.BEAT_REGISTRY_ADDRESS ?? '',
  beatNftAddress: process.env.BEAT_NFT_ADDRESS ?? '',
  beatOffersAddress: process.env.BEAT_OFFERS_ADDRESS ?? '',
  // Relayer wallet private key for register-on-upload. When set (and the
  // RPC/contract vars above are set), each upload fires a registerBeat tx.
  // Leave empty to disable on-chain writes entirely.
  relayerKey: process.env.RELAYER_KEY ?? '',
  // --- Volt Pass claim flow (token-gated) ---
  // Robinhood Chain RPC (VBEATS lives there; Pons chain, id 4663).
  rhcRpcUrl:
    process.env.RHC_RPC_URL ?? 'https://rpc.mainnet.chain.robinhood.com',
  // VBEATS token contract on Robinhood Chain. Empty until the token
  // launches — claims stay closed while unset.
  vbeatsTokenAddress: process.env.VBEATS_TOKEN_ADDRESS ?? '',
  // VoltPass v2 contract on Base. Empty until the v2 deploy lands.
  voltPassAddress: process.env.VOLT_PASS_ADDRESS ?? '',
  // How many VBEATS a wallet must hold to claim the pass.
  passHoldThreshold: process.env.PASS_HOLD_THRESHOLD ?? '10',
  // Showcase bookings unlock when the member (pass holder) count hits this.
  showcaseMemberGoal: Number(process.env.SHOWCASE_MEMBER_GOAL ?? 100),
};

export function assertSecretsInProduction() {
  if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET must be set in production');
  }
}

// Keep tree-shakeable reference so TS doesn't flag the import as unused.
void required;
