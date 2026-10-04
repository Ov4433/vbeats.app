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
} from '../utils/serialize';
import { sha256File } from '../services/fingerprintService';
import {
  checkFingerprintOnChain,
  registerBeatOnChain,
} from '../services/chainService';
import { publicBaseUrl } from '../utils/baseUrl';

// ---------------------------------------------------------------------------
// Multer: audio uploads land in <uploadDir>/ and are served at /uploads/*
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
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
  ]);
  res.json({ beats: beats.map(serializeBeat), total, page, limit });
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
// Computes the SHA-256 fingerprint server-side and stores the file locally.
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
    const audioUrl = `/uploads/${path.basename(req.file.path)}`;

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
  res.json({ beats: beats.map(serializeBeat) });
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
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
  ]);
  res.json({ beats: beats.map(serializeBeat), total, page, limit });
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
  res.json({ beats: beats.map(serializeBeat) });
});

// ---------------------------------------------------------------------------
// GET /v1/beats/:id
// ---------------------------------------------------------------------------
export const getBeat = asyncHandler(async (req: Request, res: Response) => {
  const beat = await prisma.beat.findUnique({ where: { id: req.params.id } });
  if (!beat) throw new HttpError(404, 'Beat not found');
  res.json(serializeBeat(beat));
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
