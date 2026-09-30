import fs from 'fs';
import { createApp } from './app';
import { assertSecretsInProduction, config } from './config';
import { prisma } from './db';

async function main() {
  assertSecretsInProduction();
  fs.mkdirSync(config.uploadDir, { recursive: true });

  // Fail fast if the database is unreachable.
  await prisma.$queryRaw`SELECT 1`;

  const app = createApp();
  app.listen(config.port, () => {
    console.log(`[vbeats] API listening on :${config.port} (base path /v1)`);
  });
}

main().catch((err) => {
  console.error('[vbeats] failed to start:', err);
  process.exit(1);
});
