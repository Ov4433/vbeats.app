import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Request, Response } from 'express';
import multer from 'multer';
import { prisma } from '../db';
import { config } from '../config';
import { asyncHandler } from '../utils/asyncHandler';
import { HttpError } from '../middleware/errorHandler';
import {
  normalizeBeatInput,
  serializeBeat,
  BeatCardStats,
} from '../utils/serialize';
import { sha256File } from '../services/fingerprintService';
import {
  r2Configured,
  storeAudioFile,
  r2KeyForUrl,
  deleteAudioObject,
} from '../services/storageService';
import {
  checkFingerprintOnChain,
  registerBeatOnChain,
} from '../services/chainService';
import { publicBaseUrl } from '../utils/baseUrl';
import { salesRanking, rankForBeat, playCounts } from '../services/rankService';
import { beatOffers } from '../services/offerService';
import {
  computeVoteWeight,
  voteTotals,
  votedBeatIds,
  topVoted,
} from '../services/voteService';

type Ranking = Awaited<ReturnType<typeof salesRanking>>;
type Plays = Awaited<ReturnType<typeof playCounts>>;

/** Attach back-of-the-card stats to a serialized beat. */
function withCardStats<T extends { id: string }>(
  beat: T,
  ranking: Ranking,
  plays: Plays
): T & { stats: BeatCardStats } {
  const r = rankForBeat(ranking, beat.id);
  return {
    ...beat,
    stats: {
      sales: r.sales,
      rankBySales: r.rank,
      rankedBeats: ranking.rankedBeats,
      totalBeats: ranking.totalBeats,
      plays: plays.plays.get(beat.id) ?? 0,
      uniqueListeners: plays.uniqueListeners.get(beat.id) ?? 0,
    },
  };
}

async function cardInputs(): Promise<[Ranking, Plays]> {
  return Promise.all([salesRanking(), playCounts()]);
}

type VoteTotals = Awaited<ReturnType<typeof voteTotals>>;

/** Attach vote totals + the caller's own vote state to a serialized beat. */
function withVotes<T extends { id: string }>(
  beat: T,
  totals: VoteTotals,
  voted: Set<string>
): T & { votes: { totalWeight: number; count: number }; votedByMe: boolean } {
  return {
    ...beat,
    votes: totals.get(beat.id) ?? { totalWeight: 0, count: 0 },
    votedByMe: voted.has(beat.id),
  };
}

/** Vote totals for `beatIds` + which of them `userId` voted on (if any). */
async function voteInputs(
  userId: string | undefined,
  beatIds: string[]
): Promise<[VoteTotals, Set<string>]> {
  return Promise.all([
    voteTotals(beatIds),
    userId
      ? votedBeatIds(userId, beatIds)
      : Promise.resolve(new Set<string>()),
  ]);
}

// ---------------------------------------------------------------------------
// Multer: uploads land in <uploadDir>/ as a temp pad, then move to R2 when
// configured (see uploadBeat). Local files are served at /uploads/* only in
// the no-R2 fallback (dev).
// ---------------------------------------------------------------------------
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(config.uploadDir, { recursive: true });
    cb(null, config.uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.bin';
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
  },
});

const AUDIO_MIMES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/aac',
  'audio/ogg',
  'audio/flac',
  'audio/webm',
]);

export const upload = multer({
  storage,
  limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const ok =
      AUDIO_MIMES.has(file.mimetype) ||
      ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac', '.webm', '.mp4'].includes(ext);
    // Reject non-audio with (null, false); the controller answers 400.
    cb(null, ok);
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function pagination(req: Request) {
  const page = Math.max(1, Number(req.query.page ?? 1) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20) || 20));
  return { page, limit, skip: (page - 1) * limit };
}

function localPathForAudioUrl(audioUrl: string | null): string | null {
  if (!audioUrl || !audioUrl.startsWith('/uploads/')) return null;
  const filename = path.basename(audioUrl);
  // Guard against path traversal.
  if (filename !== path.basename(filename) || filename.includes('..')) return null;
  return path.join(config.uploadDir, filename);
}

// ---------------------------------------------------------------------------
// GET /v1/beats — paginated list (newest first)
// ---------------------------------------------------------------------------
export const listBeats = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, skip } = pagination(req);
  const [total, beats] = await Promise.all([
    prisma.beat.count(),
    prisma.beat.findMany({
      orderBy: [{ isHouse: 'desc' }, { createdAt: 'desc' }],
      skip,
      take: limit,
    }),
  ]);
  const [totals, voted] = await voteInputs(
    req.user?.id,
    beats.map((b) => b.id)
  );
  res.json({
    beats: beats.map((b) => withVotes(serializeBeat(b), totals, voted)),
    total,
    page,
    limit,
  });
});

// ---------------------------------------------------------------------------
// POST /v1/beats — create from JSON metadata
// Accepts: title, genre, bpm, key, price, desc|description, dur|duration,
//          audioUrl?, fingerprint?
// ---------------------------------------------------------------------------
export const createBeat = asyncHandler(async (req: Request, res: Response) => {
  const input = normalizeBeatInput(req.body ?? {});
  if (!input.title || !input.genre) {
    throw new HttpError(400, 'title and genre are required');
  }
  if (!Number.isFinite(input.price) || input.price < 0) {
    throw new HttpError(400, 'price must be a non-negative number');
  }
  const beat = await prisma.beat.create({
    data: {
      title: input.title,
      genre: input.genre,
      bpm: input.bpm,
      musicalKey: input.musicalKey,
      price: input.price,
      description: input.description,
      durationSec: input.durationSec,
      audioUrl: input.audioUrl,
      imageUrl: input.imageUrl,
      fingerprint: input.fingerprint,
      userId: req.user!.id,
    },
  });
  res.status(201).json(serializeBeat(beat));
});

// ---------------------------------------------------------------------------
// POST /v1/beats/upload — multipart audio upload.
// Fields: title, desc|description, genre, bpm, price, dur|duration (+ file "audio").
// Computes the SHA-256 fingerprint server-side and stores the file durably
// (Cloudflare R2 when configured; local disk fallback otherwise).
// ---------------------------------------------------------------------------
export const uploadBeat = [
  upload.single('audio'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      throw new HttpError(400, 'Audio file is required (field name "audio")');
    }
    const input = normalizeBeatInput(req.body ?? {});
    if (!input.title || !input.genre) {
      fs.unlink(req.file.path, () => undefined);
      throw new HttpError(400, 'title and genre are required');
    }
    if (!Number.isFinite(input.price) || input.price < 0) {
      fs.unlink(req.file.path, () => undefined);
      throw new HttpError(400, 'price must be a non-negative number');
    }

    const fingerprint = await sha256File(req.file.path);

    // Durable storage: when R2 is configured, the file goes to the bucket
    // and the beat stores its public URL. Local disk is only a temp landing
    // pad (it is ephemeral on Render and wipes on redeploy). If the R2 write
    // fails, fail the upload — never store a URL that will 404 later.
    let audioUrl: string;
    if (r2Configured()) {
      try {
        audioUrl = await storeAudioFile(
          req.file.path,
          req.file.originalname,
          req.file.mimetype
        );
      } catch (err) {
        fs.unlink(req.file.path, () => undefined);
        throw new HttpError(502, 'Audio storage is unavailable — please retry');
      }
      fs.unlink(req.file.path, () => undefined);
    } else {
      audioUrl = `/uploads/${path.basename(req.file.path)}`;
    }

    const beat = await prisma.beat.create({
      data: {
        title: input.title,
        genre: input.genre,
        bpm: input.bpm,
        musicalKey: input.musicalKey,
        price: input.price,
        description: input.description,
        durationSec: input.durationSec,
        audioUrl,
        imageUrl: input.imageUrl,
        fingerprint,
        userId: req.user!.id,
      },
    });
    // Register-on-upload: fire-and-forget on-chain registration. Never fails
    // the upload — the verify endpoint remains the source of truth.
    // The producer's wallet address (optional `producerAddress` multipart
    // field) is recorded as the on-chain owner; without it the relayer
    // skips the write rather than claiming ownership itself.
    const metadataURI = `${publicBaseUrl(req)}/v1/beats/${beat.id}`;
    const producerAddress =
      typeof req.body?.producerAddress === 'string' ? req.body.producerAddress : undefined;
    registerBeatOnChain(fingerprint, metadataURI, producerAddress).catch(() => undefined);
    res.status(201).json({ ...serializeBeat(beat), fileUrl: audioUrl });
  }),
];

// ---------------------------------------------------------------------------
// GET /v1/beats/user — beats owned by the current user
// ---------------------------------------------------------------------------
export const getUserBeats = asyncHandler(async (req: Request, res: Response) => {
  const beats = await prisma.beat.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: 'desc' },
  });
  const [totals, voted] = await voteInputs(
    req.user!.id,
    beats.map((b) => b.id)
  );
  res.json({
    beats: beats.map((b) => withVotes(serializeBeat(b), totals, voted)),
  });
});

// ---------------------------------------------------------------------------
// GET /v1/beats/marketplace — public-ish listing with filters
// Query: search, genre, minPrice, maxPrice, page, limit
// ---------------------------------------------------------------------------
export const marketplace = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, skip } = pagination(req);
  const { search, genre, minPrice, maxPrice } = req.query as Record<string, string | undefined>;

  const where: Record<string, unknown> = {};
  if (genre) where.genre = { equals: genre, mode: 'insensitive' };
  const price: Record<string, number> = {};
  if (minPrice !== undefined && minPrice !== '') price.gte = Number(minPrice);
  if (maxPrice !== undefined && maxPrice !== '') price.lte = Number(maxPrice);
  if (Object.keys(price).length > 0) where.price = price;
  if (search) {
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [total, beats] = await Promise.all([
    prisma.beat.count({ where: where as never }),
    prisma.beat.findMany({
      where: where as never,
      orderBy: [{ isHouse: 'desc' }, { createdAt: 'desc' }],
      skip,
      take: limit,
    }),
  ]);
  const [ranking, plays] = await cardInputs();
  const [totals, voted] = await voteInputs(
    req.user?.id,
    beats.map((b) => b.id)
  );
  res.json({
    beats: beats.map((b) =>
      withVotes(withCardStats(serializeBeat(b), ranking, plays), totals, voted)
    ),
    total,
    page,
    limit,
  });
});

/** Compatibility with the mobile app's GET /beats/search?q= call. */
export const search = asyncHandler(async (req: Request, res: Response) => {
  const q = String(req.query.q ?? '').trim();
  if (!q) {
    res.json({ beats: [] });
    return;
  }
  const beats = await prisma.beat.findMany({
    where: {
      OR: [
        { title: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { genre: { contains: q, mode: 'insensitive' } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  const [totals, voted] = await voteInputs(
    req.user?.id,
    beats.map((b) => b.id)
  );
  res.json({
    beats: beats.map((b) => withVotes(serializeBeat(b), totals, voted)),
  });
});

// ---------------------------------------------------------------------------
// GET /v1/beats/:id
// ---------------------------------------------------------------------------
export const getBeat = asyncHandler(async (req: Request, res: Response) => {
  const beat = await prisma.beat.findUnique({ where: { id: req.params.id } });
  if (!beat) throw new HttpError(404, 'Beat not found');
  const [ranking, plays] = await cardInputs();
  const [totals, voted] = await voteInputs(req.user?.id, [beat.id]);
  res.json(
    withVotes(withCardStats(serializeBeat(beat), ranking, plays), totals, voted)
  );
});

// ---------------------------------------------------------------------------
// POST /v1/beats/:id/vote — toggle the current user's vote on a beat.
// Weight is snapshotted at vote time from the voter's wallet (see
// voteService.computeVoteWeight): pass holder 3, VBEATS holder 2, else 1.
// ---------------------------------------------------------------------------
export const toggleVote = asyncHandler(async (req: Request, res: Response) => {
  const beat = await prisma.beat.findUnique({ where: { id: req.params.id } });
  if (!beat) throw new HttpError(404, 'Beat not found');

  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) throw new HttpError(404, 'User not found');

  const existing = await prisma.vote.findUnique({
    where: { beatId_userId: { beatId: beat.id, userId: user.id } },
  });

  if (existing) {
    await prisma.vote.delete({ where: { id: existing.id } });
    const totals = (await voteTotals([beat.id])).get(beat.id) ?? {
      totalWeight: 0,
      count: 0,
    };
    res.json({
      voted: false,
      totalWeight: totals.totalWeight,
      voteCount: totals.count,
      weight: 0,
    });
    return;
  }

  const weight = await computeVoteWeight(user.wallet ?? null);
  await prisma.vote.create({
    data: {
      beatId: beat.id,
      userId: user.id,
      walletAddress: user.wallet ?? null,
      weight,
    },
  });
  const totals = (await voteTotals([beat.id])).get(beat.id) ?? {
    totalWeight: 0,
    count: 0,
  };
  res.json({
    voted: true,
    totalWeight: totals.totalWeight,
    voteCount: totals.count,
    weight,
  });
});

// ---------------------------------------------------------------------------
// GET /v1/beats/top-voted — public chart (optionalAuth).
// `beats` is the current UTC week's ranking with house beats pinned first
// (a house beat appears even with zero week votes, carrying its week
// totals), followed by the ranked non-house beats. `allTime` is the pure
// all-time top 10 (no pinning). Entries carry week totals in `beats` and
// all-time totals in `allTime`.
// ---------------------------------------------------------------------------
export const topVotedChart = asyncHandler(async (req: Request, res: Response) => {
  const { week, weekList, allTimeList } = await topVoted(10);

  const houseBeats = await prisma.beat.findMany({ where: { isHouse: true } });
  const houseIds = new Set(houseBeats.map((b) => b.id));

  // Week totals for house beats that didn't make the week's ranking.
  const weekById = new Map(weekList.map((r) => [r.beatId, r]));
  const missingHouseIds = houseBeats
    .map((b) => b.id)
    .filter((id) => !weekById.has(id));
  if (missingHouseIds.length > 0) {
    const groups = await prisma.vote.groupBy({
      by: ['beatId'],
      where: {
        beatId: { in: missingHouseIds },
        createdAt: { gte: week.start, lt: week.end },
      },
      _sum: { weight: true },
      _count: { beatId: true },
    });
    for (const g of groups) {
      weekById.set(g.beatId, {
        beatId: g.beatId,
        totalWeight: g._sum.weight ?? 0,
        count: g._count.beatId,
      });
    }
  }

  // House first (ordered among themselves by week weight, then count),
  // then the ranked non-house beats in ranking order.
  const pinnedHouse = houseBeats
    .map((b) => ({
      beat: b,
      ranked: weekById.get(b.id) ?? { beatId: b.id, totalWeight: 0, count: 0 },
    }))
    .sort(
      (a, b) =>
        b.ranked.totalWeight - a.ranked.totalWeight ||
        b.ranked.count - a.ranked.count
    );
  const rankedNonHouse = weekList.filter((r) => !houseIds.has(r.beatId));

  const allTimeById = new Map(allTimeList.map((r) => [r.beatId, r]));

  const allIds = [
    ...new Set([
      ...houseBeats.map((b) => b.id),
      ...weekList.map((r) => r.beatId),
      ...allTimeList.map((r) => r.beatId),
    ]),
  ];
  const beatRows =
    allIds.length > 0
      ? await prisma.beat.findMany({ where: { id: { in: allIds } } })
      : [];
  const beatById = new Map(beatRows.map((b) => [b.id, b]));
  // House beats are already in hand; make sure they resolve too.
  for (const b of houseBeats) beatById.set(b.id, b);

  const voted = req.user
    ? await votedBeatIds(req.user.id, allIds)
    : new Set<string>();

  const entry = (
    beatId: string,
    totals: { totalWeight: number; count: number }
  ) => {
    const beat = beatById.get(beatId);
    if (!beat) return null;
    return {
      ...serializeBeat(beat),
      votes: { totalWeight: totals.totalWeight, count: totals.count },
      votedByMe: voted.has(beatId),
    };
  };

  const beats = [
    ...pinnedHouse.map(({ beat, ranked }) => entry(beat.id, ranked)),
    ...rankedNonHouse.map((r) => entry(r.beatId, r)),
  ].filter(Boolean);

  const allTime = allTimeList
    .map((r) => entry(r.beatId, allTimeById.get(r.beatId) ?? r))
    .filter(Boolean);

  res.json({
    weekStart: week.start.toISOString(),
    weekEnd: week.end.toISOString(),
    beats,
    allTime,
  });
});

export const beatOffersInfo = asyncHandler(async (req: Request, res: Response) => {
  const beat = await prisma.beat.findUnique({ where: { id: req.params.id } });
  if (!beat) throw new HttpError(404, 'Beat not found');
  res.json(await beatOffers(beat.fingerprint));
});

// ---------------------------------------------------------------------------
// POST /v1/beats/:id/play — record a listen. Public: logged-in listeners are
// attributed, everyone else counts as anonymous (IP-hashed for dedupe).
// Dedupe window: one counted play per listener per beat per 30 minutes.
// Body: { listenedSec?: number }.
// ---------------------------------------------------------------------------
const PLAY_DEDUPE_MINUTES = 30;

function ipHash(req: Request): string | null {
  const ip =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress;
  if (!ip) return null;
  // Daily salt keeps hashes from being a permanent fingerprint.
  const day = new Date().toISOString().slice(0, 10);
  return crypto.createHash('sha256').update(`${ip}|${day}|${config.jwtSecret}`).digest('hex');
}

export const recordPlay = asyncHandler(async (req: Request, res: Response) => {
  const beat = await prisma.beat.findUnique({ where: { id: req.params.id } });
  if (!beat) throw new HttpError(404, 'Beat not found');

  const listenedSec = Math.max(
    0,
    Math.min(86400, Math.floor(Number(req.body?.listenedSec ?? 0) || 0))
  );
  const userId = req.user?.id ?? null;
  const hash = userId ? null : ipHash(req);
  const since = new Date(Date.now() - PLAY_DEDUPE_MINUTES * 60 * 1000);

  const recent = await prisma.play.findFirst({
    where: {
      beatId: beat.id,
      createdAt: { gte: since },
      ...(userId ? { userId } : hash ? { ipHash: hash } : { id: '__never__' }),
    },
    select: { id: true },
  });
  if (recent) {
    return res.json({ counted: false, deduped: true });
  }

  await prisma.play.create({
    data: { beatId: beat.id, userId, ipHash: hash, listenedSec },
  });
  res.status(201).json({ counted: true });
});

// ---------------------------------------------------------------------------
// PUT /v1/beats/:id — owner only
// ---------------------------------------------------------------------------
export const updateBeat = asyncHandler(async (req: Request, res: Response) => {
  const beat = await prisma.beat.findUnique({ where: { id: req.params.id } });
  if (!beat) throw new HttpError(404, 'Beat not found');
  if (beat.userId !== req.user!.id) throw new HttpError(403, 'Not your beat');

  const input = normalizeBeatInput({ ...beat, ...req.body });
  const updated = await prisma.beat.update({
    where: { id: beat.id },
    data: {
      title: input.title || beat.title,
      genre: input.genre || beat.genre,
      bpm: input.bpm,
      musicalKey: input.musicalKey,
      price: Number.isFinite(input.price) ? input.price : beat.price,
      description: input.description,
      durationSec: input.durationSec,
      audioUrl: input.audioUrl ?? beat.audioUrl,
      imageUrl: input.imageUrl ?? beat.imageUrl,
      fingerprint: input.fingerprint ?? beat.fingerprint,
    },
  });
  res.json(serializeBeat(updated));
});

// ---------------------------------------------------------------------------
// DELETE /v1/beats/:id — owner only
// ---------------------------------------------------------------------------
export const deleteBeat = asyncHandler(async (req: Request, res: Response) => {
  const beat = await prisma.beat.findUnique({ where: { id: req.params.id } });
  if (!beat) throw new HttpError(404, 'Beat not found');
  if (beat.userId !== req.user!.id) throw new HttpError(403, 'Not your beat');

  await prisma.beat.delete({ where: { id: beat.id } });
  const localPath = localPathForAudioUrl(beat.audioUrl);
  if (localPath) fs.unlink(localPath, () => undefined);
  const r2Key = r2Configured() ? r2KeyForUrl(beat.audioUrl) : null;
  if (r2Key) deleteAudioObject(r2Key).catch(() => undefined);
  res.status(200).json({ ok: true });
});

// ---------------------------------------------------------------------------
// POST /v1/beats/:id/verify — recompute the SHA-256 fingerprint and check
// whether it is registered in the BeatRegistry contract (read-only).
// Returns { verified, fingerprint, onChain }.
// ---------------------------------------------------------------------------
export const verifyBeat = asyncHandler(async (req: Request, res: Response) => {
  const beat = await prisma.beat.findUnique({ where: { id: req.params.id } });
  if (!beat) throw new HttpError(404, 'Beat not found');

  let fingerprint: string | null = beat.fingerprint;
  let verified: boolean | null = null;

  const localPath = localPathForAudioUrl(beat.audioUrl);
  if (localPath && fs.existsSync(localPath)) {
    const recomputed = await sha256File(localPath);
    if (fingerprint) {
      verified = recomputed === fingerprint;
    } else {
      fingerprint = recomputed;
      verified = true;
      await prisma.beat.update({
        where: { id: beat.id },
        data: { fingerprint },
      });
    }
  } else if (fingerprint) {
    // No local file to recompute from (remote audioUrl); nothing to compare.
    verified = null;
  }

  const chain = await checkFingerprintOnChain(fingerprint);
  res.json({
    verified,
    fingerprint,
    onChain: chain.onChain,
    chainConfigured: chain.configured,
    ...(chain.owner ? { chainOwner: chain.owner } : {}),
  });
});

// ---------------------------------------------------------------------------
// GET /v1/beats/:id/nft — NFT licensing info for a beat.
// tokenId = uint256(SHA-256 fingerprint), so the token is cryptographically
// tied to the exact audio. Returns configured=false until BEAT_NFT_ADDRESS
// is set (see contracts/scripts/deploy.ts).
// ---------------------------------------------------------------------------
export const beatNftInfo = asyncHandler(async (req: Request, res: Response) => {
  const beat = await prisma.beat.findUnique({ where: { id: req.params.id } });
  if (!beat) throw new HttpError(404, 'Beat not found');
  if (!config.beatNftAddress || !beat.fingerprint) {
    return res.json({ configured: false });
  }
  const fp = beat.fingerprint.startsWith('0x') ? beat.fingerprint : `0x${beat.fingerprint}`;
  res.json({
    configured: true,
    contract: config.beatNftAddress,
    tokenId: BigInt(fp).toString(10),
    fingerprint: fp,
    metadataURI: `${config.apiBaseUrl}/v1/beats/${beat.id}`,
  });
});
