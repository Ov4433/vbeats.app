import { Request, Response } from 'express';
import { prisma } from '../db';
import { asyncHandler } from '../utils/asyncHandler';
import { HttpError } from '../middleware/errorHandler';
import { serializeBeat } from '../utils/serialize';

// ---------------------------------------------------------------------------
// Feature / co-sign requests (Nov 13).
//
// A singer asks the parent beat's producer to feature their song — i.e.
// to co-sign it live. Accepting sets the song's coSignStatus to 'live';
// declining sets it to 'rejected'. The underlying pending flag and the
// direct POST /v1/beats/:id/co-sign endpoint still exist underneath;
// this is the user-facing inbox flow on top of them.
//
// There is NO on-chain co-sign: this is a plain DB/API request + flag,
// honestly labelled in the UI as "Request feature" / "Awaiting producer
// co-sign". One pending request per song at a time.
// ---------------------------------------------------------------------------

const REQUEST_SELECT = {
  include: {
    song: {
      select: {
        id: true,
        title: true,
        kind: true,
        coSignStatus: true,
        audioUrl: true,
        userId: true,
      },
    },
    parentBeat: { select: { id: true, title: true, userId: true } },
    producer: { select: { id: true, username: true } },
    requester: { select: { id: true, username: true } },
  },
} as const;

function serializeFeature(r: any) {
  return {
    id: r.id,
    songId: r.songId,
    parentBeatId: r.parentBeatId,
    producerId: r.producerId,
    requesterId: r.requesterId,
    status: r.status,
    message: r.message ?? null,
    createdAt: r.createdAt.toISOString(),
    respondedAt: r.respondedAt ? r.respondedAt.toISOString() : null,
    song: r.song
      ? {
          id: r.song.id,
          title: r.song.title,
          kind: r.song.kind,
          coSignStatus: r.song.coSignStatus,
          audioUrl: r.song.audioUrl,
          userId: r.song.userId,
        }
      : null,
    parentBeat: r.parentBeat
      ? { id: r.parentBeat.id, title: r.parentBeat.title, userId: r.parentBeat.userId }
      : null,
    producer: r.producer ? { id: r.producer.id, username: r.producer.username } : null,
    requester: r.requester ? { id: r.requester.id, username: r.requester.username } : null,
  };
}

// ---------------------------------------------------------------------------
// POST /v1/features — song owner requests a feature (co-sign) from the
// parent beat's producer. Body: { songId, message? }.
// ---------------------------------------------------------------------------
export const createFeatureRequest = asyncHandler(async (req: Request, res: Response) => {
  const songId = String(req.body?.songId ?? '').trim();
  if (!songId) throw new HttpError(400, 'songId is required');
  const message =
    typeof req.body?.message === 'string' && req.body.message.trim()
      ? req.body.message.trim().slice(0, 500)
      : null;

  const song = await prisma.beat.findUnique({
    where: { id: songId },
    include: { parentBeat: { select: { id: true, userId: true } } },
  });
  if (!song) throw new HttpError(404, 'Song not found');
  if ((song as any).kind !== 'song') {
    throw new HttpError(400, 'Only a song can request a feature');
  }
  if (song.userId !== req.user!.id) {
    throw new HttpError(403, 'Only the song maker can request a feature for it');
  }
  if ((song as any).coSignStatus === 'live') {
    throw new HttpError(400, 'This song is already live — no feature request needed');
  }
  if ((song as any).coSignStatus === 'rejected') {
    throw new HttpError(400, 'This song was declined — ask the producer before requesting again');
  }
  if (!(song as any).parentBeatId || !(song as any).parentBeat) {
    throw new HttpError(400, 'This song has no parent beat to request a feature from');
  }

  const existing = await prisma.featureRequest.findFirst({
    where: { songId, status: 'pending' },
  });
  if (existing) {
    throw new HttpError(409, 'A feature request for this song is already waiting on the producer');
  }

  const created = await prisma.featureRequest.create({
    data: {
      songId,
      parentBeatId: (song as any).parentBeatId,
      producerId: (song as any).parentBeat.userId,
      requesterId: req.user!.id,
      message,
    } as any,
    ...REQUEST_SELECT,
  });
  res.status(201).json(serializeFeature(created));
});

// ---------------------------------------------------------------------------
// GET /v1/features/inbox — requests waiting on ME as a parent-beat producer.
// GET /v1/features/sent — requests I sent as a singer.
// ---------------------------------------------------------------------------
export const listFeatureInbox = asyncHandler(async (req: Request, res: Response) => {
  const requests = await prisma.featureRequest.findMany({
    where: { producerId: req.user!.id },
    orderBy: { createdAt: 'desc' },
    ...REQUEST_SELECT,
  });
  res.json({ requests: requests.map(serializeFeature) });
});

export const listFeatureSent = asyncHandler(async (req: Request, res: Response) => {
  const requests = await prisma.featureRequest.findMany({
    where: { requesterId: req.user!.id },
    orderBy: { createdAt: 'desc' },
    ...REQUEST_SELECT,
  });
  res.json({ requests: requests.map(serializeFeature) });
});

// ---------------------------------------------------------------------------
// POST /v1/features/:id/respond — parent producer accepts or declines.
// Body: { action: 'accept' | 'decline' }.
// Accept → request accepted AND the song goes live (coSignStatus 'live').
// Decline → request declined AND the song is marked 'rejected'.
// ---------------------------------------------------------------------------
export const respondFeatureRequest = asyncHandler(async (req: Request, res: Response) => {
  const request = await prisma.featureRequest.findUnique({
    where: { id: req.params.id },
    ...REQUEST_SELECT,
  });
  if (!request) throw new HttpError(404, 'Feature request not found');
  if (request.producerId !== req.user!.id) {
    throw new HttpError(403, 'Only the parent beat producer can answer this request');
  }
  if (request.status !== 'pending') {
    throw new HttpError(400, 'This request has already been answered');
  }
  const action = String(req.body?.action ?? '').toLowerCase();
  if (action !== 'accept' && action !== 'decline') {
    throw new HttpError(400, "action must be 'accept' or 'decline'");
  }

  const song = await prisma.beat.findUnique({ where: { id: request.songId } });
  if (!song) throw new HttpError(404, 'Song not found');
  if ((song as any).coSignStatus !== 'pending') {
    throw new HttpError(400, 'This song is no longer awaiting co-sign');
  }

  const [updatedRequest] = await prisma.$transaction([
    prisma.featureRequest.update({
      where: { id: request.id },
      data: { status: action === 'accept' ? 'accepted' : 'declined', respondedAt: new Date() } as any,
      ...REQUEST_SELECT,
    }),
    prisma.beat.update({
      where: { id: song.id },
      data: {
        coSignStatus: action === 'accept' ? 'live' : 'rejected',
        coSignedAt: new Date(),
      } as any,
    }),
  ]);
  const updatedSong = await prisma.beat.findUnique({
    where: { id: song.id },
    include: { parentBeat: { select: { id: true, title: true, userId: true } } },
  });
  if (!updatedSong) throw new HttpError(404, 'Song not found');
  res.json({
    ...serializeFeature(updatedRequest),
    song: serializeBeat(updatedSong),
  });
});
