// Seed script: demo user + the three beats from the tappable demo mock.
// Run: npm run seed   (requires DATABASE_URL + migrated DB)
// Dev-only credentials — change immediately in any shared environment.
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Default artwork for seeded beats: the official studio logo,
// served by the API at /brand/logo.png.
const LOGO_URL = `${
  process.env.API_BASE_URL ?? 'http://localhost:4000'
}/brand/logo.png`;

const DEMO_BEATS = [
  {
    title: 'Midnight Drive',
    genre: 'Trap',
    bpm: 140,
    price: 19.99,
    description: 'Dark rolling 808s with a haunting bell melody.',
    durationSec: 173,
  },
  {
    title: 'Neon Skyline',
    genre: 'Hip-Hop',
    bpm: 92,
    price: 29.99,
    description: 'Boom-bap drums under shimmering city-night keys.',
    durationSec: 201,
  },
  {
    title: 'Velvet Bass',
    genre: 'R&B',
    bpm: 100,
    price: 9.99,
    description: 'Smooth low-end groove, late-night vibes.',
    durationSec: 158,
  },
];

async function main() {
  const passwordHash = await bcrypt.hash('vbeats-demo-123', 10);

  const user = await prisma.user.upsert({
    where: { email: 'demo@vbeats.app' },
    update: {},
    create: {
      email: 'demo@vbeats.app',
      username: 'demo',
      passwordHash,
    },
  });

  for (const beat of DEMO_BEATS) {
    const existing = await prisma.beat.findFirst({
      where: { title: beat.title, userId: user.id },
    });
    if (!existing) {
      await prisma.beat.create({
        data: { ...beat, imageUrl: LOGO_URL, userId: user.id },
      });
    }
  }

  console.log(`Seeded demo user ${user.email} with ${DEMO_BEATS.length} beats.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
