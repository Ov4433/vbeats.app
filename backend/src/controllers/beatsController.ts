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
import { getNftListing } from '../services/nftService';
import { publicBaseUrl } from '../utils/baseUrl';
import { salesRanking, rankForBeat, playCounts, playCountsInWindow } from '../services/rankService';
import { beatOffers } from '../services/offerService';
import {
  computeVoteWeight,
  voteTotals,
  voteTotalsInWindow,
  votedBeatIds,
  topVoted,
  weekWindowUtc,
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

/** "Co-signed by …" (money path, Nov 13): for songs that went live
    through an accepted feature request, attach the accepting producer's
    username. One query per call, only for live songs with a co-sign
    time. Never invents a co-signer — a song with no accepted request
    gets coSignedBy: null. */
async function withCoSignedBy<T extends {
  id: string; kind?: string; coSignStatus?: string; coSignedAt?: string | null;
}>(
  beats: T[]
): Promise<(T & { coSignedBy: { id: string; username: string } | null })[]> {
  const ids = beats
    .filter((b) => b.kind === 'song' && b.coSignStatus === 'live' && b.coSignedAt)
    .map((b) => b.id);
  if (!ids.length) return beats.map((b) => ({ ...b, coSignedBy: null }));
  const accepted = await prisma.featureRequest.findMany({
    where: { songId: { in: ids }, status: 'accepted' },
    include: { producer: { select: { id: true, username: true } } },
    orderBy: { respondedAt: 'desc' },
  });
  const bySong = new Map<string, { id: string; username: string }>();
  for (const r of accepted) {
    if (!bySong.has(r.songId) && r.producer) {
      bySong.set(r.songId, { id: r.producer.id, username: r.producer.username });
    }
  }
  return beats.map((b) => ({ ...b, coSignedBy: bySong.get(b.id) ?? null }));
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

/**
 * Weekly window data for `?window=7d`: per-beat plays + vote weight inside
 * the current Mon–Sun UTC week. Returns null unless the caller asked for
 * the window — lifetime totals stay the default, and nothing is ever
 * labelled "this week" unless it was actually measured in the week.
 */
async function weekInputs(beatIds: string[]): Promise<{
  week: { start: string; end: string };
  plays: Map<string, number>;
  votes: Map<string, { totalWeight: number; count: number }>;
} | null> {
  const { start, end } = weekWindowUtc();
  const [plays, votes] = await Promise.all([
    playCountsInWindow(start, end),
    voteTotalsInWindow(beatIds, start, end),
  ]);
  return {
    week: { start: start.toISOString(), end: end.toISOString() },
    plays,
    votes,
  };
}

/** Attach the per-beat `week` field ({ plays, votes }) when window data exists. */
function withWeek<T extends { id: string }>(
  beat: T,
  w: Awaited<ReturnType<typeof weekInputs>>
): T & { week: { plays: number; votes: number } } {
  return {
    ...beat,
    week: {
      plays: w ? w.plays.get(beat.id) ?? 0 : 0,
      votes: w ? w.votes.get(beat.id)?.totalWeight ?? 0 : 0,
    },
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
// Query: window=7d — attach per-beat `week: { plays, votes }` measured in
// the current Mon–Sun UTC week, plus top-level `week: { start, end }`.
// Without it, only lifetime totals are returned.
// ---------------------------------------------------------------------------

/** Make-a-song visibility + co-sign (Nov 13).
 * A pending song is visible ONLY to its singer and to the parent beat's
 * producer — never in a public list. Everything else is 'live'.
 * There is NO on-chain co-sign: this is a plain DB/API pending flag,
 * honestly labelled in the UI as "Awaiting producer co-sign". */
const PARENT_SELECT = { select: { id: true, title: true, userId: true } } as const;
function visibilityWhere(userId?: string) {
  // Beats are 'live' by default; a pending song shows only to its singer.
  return { OR: [{ coSignStatus: 'live' }, { userId: userId ?? '__nobody__' }] };
}
async function resolveSongFields(input: { kind: string; parentBeatId: string | null }, userId: string) {
  if (input.kind !== 'song') return { kind: 'beat', parentBeatId: null, coSignStatus: 'live', coSignedAt: null };
  if (!input.parentBeatId) throw new HttpError(400, 'A song needs a parent beat to rap on');
  const parent = await prisma.beat.findUnique({ where: { id: input.parentBeatId } });
  if (!parent) throw new HttpError(400, 'Parent beat not found');
  if ((parent as any).kind === 'song') throw new HttpError(400, 'Rap on a beat, not on another song');
  const own = parent.userId === userId;
  return {
    kind: 'song',
    parentBeatId: parent.id,
    coSignStatus: own ? 'live' : 'pending',
    coSignedAt: own ? new Date() : null,
  };
}

export const listBeats = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, skip } = pagination(req);
  const wantWeek = req.query.window === '7d';
  const kind = String(req.query.kind ?? '').toLowerCase();
  const visible = visibilityWhere(req.user?.id);
  const where = {
    AND: [
      visible,
      ...(kind === 'beat' || kind === 'song' ? [{ kind }] : []),
    ],
  };
  const [total, beats] = await Promise.all([
    prisma.beat.count({ where: where as never }),
    prisma.beat.findMany({
      where: where as never,
      include: { parentBeat: PARENT_SELECT },
      orderBy: [{ isHouse: 'desc' }, { createdAt: 'desc' }],
      skip,
      take: limit,
    }),
  ]);
  const [totals, voted] = await voteInputs(
    req.user?.id,
    beats.map((b) => b.id)
  );
  const week = wantWeek
    ? await weekInputs(beats.map((b) => b.id))
    : null;
  res.json({
    beats: await withCoSignedBy(beats.map((b) =>
      week ? withWeek(withVotes(serializeBeat(b), totals, voted), week) : withVotes(serializeBeat(b), totals, voted)
    )),
    total,
    page,
    limit,
    ...(week ? { week: week.week } : {}),
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
  const song = await resolveSongFields(input, req.user!.id);
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
      ...song,
    } as any,
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

    const song = await resolveSongFields(input, req.user!.id);
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
        ...song,
      } as any,
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
    beats: await withCoSignedBy(beats.map((b) => withVotes(serializeBeat(b), totals, voted))),
  });
});

// ---------------------------------------------------------------------------
// GET /v1/beats/marketplace — public-ish listing with filters
// Query: search, genre, minPrice, maxPrice, page, limit
// ---------------------------------------------------------------------------
export const marketplace = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, skip } = pagination(req);
  const { search, genre, minPrice, maxPrice, kind } = req.query as Record<string, string | undefined>;

  const where: Record<string, unknown> = {};
  if (genre) where.genre = { equals: genre, mode: 'insensitive' };
  // Feed filter (Nov 13): ?kind=beat|song. Anything else means all.
  if (kind === 'beat' || kind === 'song') where.kind = kind;
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

  const visibleWhere = visibilityWhere(req.user?.id);
  const combinedWhere = { AND: [visibleWhere, where] };
  const [total, beats] = await Promise.all([
    prisma.beat.count({ where: combinedWhere as never }),
    prisma.beat.findMany({
      where: combinedWhere as never,
      include: { parentBeat: PARENT_SELECT },
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
  const week = req.query.window === '7d'
    ? await weekInputs(beats.map((b) => b.id))
    : null;
  res.json({
    beats: await withCoSignedBy(beats.map((b) => {
      const withStats = withVotes(withCardStats(serializeBeat(b), ranking, plays), totals, voted);
      return week ? withWeek(withStats, week) : withStats;
    })),
    total,
    page,
    limit,
    ...(week ? { week: week.week } : {}),
  });
});

/** Compatibility with the mobile app's GET /beats/search?q= call. */
export const search = asyncHandler(async (req: Request, res: Response) => {
  const q = String(req.query.q ?? '').trim();
  const kind = String(req.query.kind ?? '').toLowerCase();
  if (!q) {
    res.json({ beats: [] });
    return;
  }
  const beats = await prisma.beat.findMany({
    where: {
      AND: [
        visibilityWhere(req.user?.id),
        ...(kind === 'beat' || kind === 'song' ? [{ kind }] : []),
        {
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { description: { contains: q, mode: 'insensitive' } },
            { genre: { contains: q, mode: 'insensitive' } },
          ],
        },
      ],
    } as never,
    include: { parentBeat: PARENT_SELECT },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  const [totals, voted] = await voteInputs(
    req.user?.id,
    beats.map((b) => b.id)
  );
  res.json({
    beats: await withCoSignedBy(beats.map((b) => withVotes(serializeBeat(b), totals, voted))),
  });
});

// ---------------------------------------------------------------------------
// GET /v1/beats/:id
// ---------------------------------------------------------------------------
export const getBeat = asyncHandler(async (req: Request, res: Response) => {
  const beat = await prisma.beat.findUnique({
    where: { id: req.params.id },
    include: { parentBeat: PARENT_SELECT },
  });
  if (!beat) throw new HttpError(404, 'Beat not found');
  if ((beat as any).coSignStatus === 'pending') {
    const me = req.user?.id;
    const parentOwner = (beat as any).parentBeat?.userId;
    if (me !== beat.userId && me !== parentOwner) throw new HttpError(404, 'Beat not found');
  }
  const [ranking, plays] = await cardInputs();
  const [totals, voted] = await voteInputs(req.user?.id, [beat.id]);
  res.json(
    (await withCoSignedBy([withVotes(withCardStats(serializeBeat(beat), ranking, plays), totals, voted)]))[0]
  );
});

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// GET /v1/beats/pending-co-sign — songs awaiting MY approval as the parent
// beat's producer. POST /v1/beats/:id/co-sign — approve / reject one.
// Only the parent beat's producer can decide; the singer cannot approve
// their own song over someone else's beat. No on-chain step exists.
// ---------------------------------------------------------------------------
export const listPendingCoSign = asyncHandler(async (req: Request, res: Response) => {
  const myBeats = await prisma.beat.findMany({
    where: { userId: req.user!.id },
    select: { id: true },
  });
  const parentIds = myBeats.map((b) => b.id);
  const songs = await prisma.beat.findMany({
    where: { kind: 'song', coSignStatus: 'pending', parentBeatId: { in: parentIds } },
    include: { parentBeat: PARENT_SELECT },
    orderBy: { createdAt: 'desc' },
  });
  const [totals, voted] = await voteInputs(req.user!.id, songs.map((b) => b.id));
  res.json({ beats: songs.map((b) => withVotes(serializeBeat(b), totals, voted)) });
});

export const coSignBeat = asyncHandler(async (req: Request, res: Response) => {
  const beat = await prisma.beat.findUnique({
    where: { id: req.params.id },
    include: { parentBeat: PARENT_SELECT },
  });
  if (!beat) throw new HttpError(404, 'Beat not found');
  if ((beat as any).kind !== 'song') throw new HttpError(400, 'Only songs need a co-sign');
  if ((beat as any).coSignStatus !== 'pending') throw new HttpError(400, 'This song is not awaiting co-sign');
  if ((beat as any).parentBeat?.userId !== req.user!.id) {
    throw new HttpError(403, 'Only the parent beat producer can co-sign this song');
  }
  const action = String(req.body?.action ?? '').toLowerCase();
  if (action !== 'approve' && action !== 'reject') {
    throw new HttpError(400, 'action must be approve or reject');
  }
  const updated = await prisma.beat.update({
    where: { id: beat.id },
    data: {
      coSignStatus: action === 'approve' ? 'live' : 'rejected',
      coSignedAt: new Date(),
    } as any,
    include: { parentBeat: PARENT_SELECT },
  });
  res.json(serializeBeat(updated));
});

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

  // Vote gate (Nov 13): a song that is still awaiting producer co-sign
  // — or was declined — cannot be voted on, so it can never surface in
  // Top Voted. Retracting an existing vote is always allowed.
  if (!existing && (beat as any).kind === 'song' && (beat as any).coSignStatus !== 'live') {
    throw new HttpError(
      400,
      (beat as any).coSignStatus === 'pending'
        ? 'This song is still awaiting producer co-sign — it can be voted on once the producer approves it'
        : 'This song was not co-signed by the producer, so it cannot be voted on'
    );
  }

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
// POST /v1/beats/verify-batch — on-chain registration status for up to 12
// beats at once (read-only). The feed uses it lazily: cards verify as they
// scroll into view instead of blocking the feed on 12 chain calls, and
// results are cached per beat id on the client. Never throws per beat —
// a failed check reports onChain=false with configured=true.
// ---------------------------------------------------------------------------
export const verifyBatch = asyncHandler(async (req: Request, res: Response) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  if (ids.length === 0 || ids.length > 12) {
    throw new HttpError(400, 'ids must be an array of 1–12 beat ids');
  }
  const beats = await prisma.beat.findMany({
    where: { id: { in: ids.map(String) } },
    select: { id: true, fingerprint: true },
  });
  const results: Record<
    string,
    { onChain: boolean; configured: boolean; owner?: string; registeredAt?: string }
  > = {};
  await Promise.all(
    beats.map(async (b) => {
      const chain = await checkFingerprintOnChain(b.fingerprint);
      results[b.id] = {
        onChain: chain.onChain,
        configured: chain.configured,
        ...(chain.owner ? { owner: chain.owner } : {}),
        ...(chain.registeredAt ? { registeredAt: chain.registeredAt } : {}),
      };
    })
  );
  const chainConfigured = Boolean(config.rpcUrl && config.beatRegistryAddress);
  res.json({ results, chainConfigured });
});

// ---------------------------------------------------------------------------
// GET /v1/beats/:id/nft — NFT licensing info for a beat.
// tokenId = uint256(SHA-256 fingerprint), so the token is cryptographically
// tied to the exact audio. Returns configured=false until BEAT_NFT_ADDRESS
// is set (see contracts/scripts/deploy.ts). `listing` reports what can
// actually be bought right now: a license type is listed only when the
// producer set a price AND stocked licenses in the contract — the two
// conditions BeatNFT.buy() requires. A display price alone is not a buy.
// ---------------------------------------------------------------------------
export const beatNftInfo = asyncHandler(async (req: Request, res: Response) => {
  const beat = await prisma.beat.findUnique({ where: { id: req.params.id } });
  if (!beat) throw new HttpError(404, 'Beat not found');
  if (!config.beatNftAddress || !beat.fingerprint) {
    return res.json({ configured: false });
  }
  const fp = beat.fingerprint.startsWith('0x') ? beat.fingerprint : `0x${beat.fingerprint}`;
  const listing = await getNftListing(beat.fingerprint);
  res.json({
    configured: true,
    contract: config.beatNftAddress,
    tokenId: BigInt(fp).toString(10),
    fingerprint: fp,
    metadataURI: `${config.apiBaseUrl}/v1/beats/${beat.id}`,
    listing: { lease: listing.lease, exclusive: listing.exclusive },
    royaltyBps: listing.royaltyBps,
  });
});
