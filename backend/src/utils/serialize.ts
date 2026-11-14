import { Beat, User } from '@prisma/client';

export interface SerializedUser {
  id: string;
  email: string;
  username: string;
  wallet: string | null;
  bat: string | null;
  solanaAddress: string | null;
  createdAt: string;
}

/**
 * Public user shape. Matches the mobile app's AuthResponse user
 * ({id, email, username, wallet?}).
 */
export function serializeUser(user: User): SerializedUser {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    wallet: user.wallet,
    bat: user.bat ?? null,
    solanaAddress: user.solanaAddress ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}

export interface SerializedBeat {
  // Canonical fields
  id: string;
  title: string;
  genre: string;
  bpm: number | null;
  price: number;
  userId: string;
  isHouse: boolean;
  audioUrl: string | null;
  imageUrl: string | null;
  artworkUrl: string | null;
  fingerprint: string | null;
  // Demo names (from the tappable demo mock)
  desc: string | null;
  dur: number;
  date: string;
  // Mobile-app aliases (app/services/beatService.ts)
  key: string | null;
  description: string | null;
  duration: number;
  createdAt: string;
  updatedAt: string;
  // Make-a-song fields (kind / parentBeatId / coSignStatus are stored;
  // parentBeat is populated by the controller when it includes it).
  kind?: string;
  parentBeatId?: string | null;
  coSignStatus?: string;
  coSignedAt?: string | null;
  // "Co-signed by …" (money path, Nov 13): the parent beat producer's
  // username, attached by the controller when a song went live through an
  // accepted feature request. Absent = not co-signed this way.
  coSignedBy?: { id: string; username: string } | null;
  parentBeat?: { id: string; title: string; userId: string } | null;
  // Card-back stats (populated by the beats controller, not stored)
  stats?: BeatCardStats;
  // Vote totals (populated by the beats controller, not stored)
  votes?: { totalWeight: number; count: number };
  votedByMe?: boolean;
}

/** "Back of the baseball card" numbers for a beat. */
export interface BeatCardStats {
  /** Completed sales (licenses + purchases). */
  sales: number;
  /** Rank by beats sold, 1 = best seller. Ties share a rank. */
  rankBySales: number;
  /** How many beats appear on the sales leaderboard. */
  rankedBeats: number;
  /** Total beats in the studio, for "rank #3 of 128". */
  totalBeats: number;
  /** Total recorded plays (deduped per listener per 30 min). */
  plays: number;
  /** Distinct logged-in listeners. */
  uniqueListeners: number;
}

/**
 * Beat shape carrying BOTH the demo's field names (desc, dur, date) and the
 * mobile app's aliases (description, duration, createdAt) so both clients
 * work without changes.
 */
export function serializeBeat(beat: Beat): SerializedBeat {
  return {
    id: beat.id,
    title: beat.title,
    genre: beat.genre,
    bpm: beat.bpm,
    price: beat.price,
    userId: beat.userId,
    isHouse: beat.isHouse ?? false,
    audioUrl: beat.audioUrl,
    imageUrl: beat.imageUrl,
    artworkUrl: beat.imageUrl,
    fingerprint: beat.fingerprint,
    desc: beat.description,
    description: beat.description,
    dur: beat.durationSec,
    duration: beat.durationSec,
    kind: (beat as any).kind ?? 'beat',
    parentBeatId: (beat as any).parentBeatId ?? null,
    coSignStatus: (beat as any).coSignStatus ?? 'live',
    coSignedAt: (beat as any).coSignedAt ? (beat as any).coSignedAt.toISOString() : null,
    parentBeat: (beat as any).parentBeat
      ? { id: (beat as any).parentBeat.id, title: (beat as any).parentBeat.title, userId: (beat as any).parentBeat.userId }
      : null,
    date: beat.createdAt.toISOString(),
    createdAt: beat.createdAt.toISOString(),
    updatedAt: beat.updatedAt.toISOString(),
    key: beat.musicalKey,
  };
}

export interface BeatInput {
  title?: unknown;
  genre?: unknown;
  bpm?: unknown;
  key?: unknown;
  price?: unknown;
  desc?: unknown;
  description?: unknown;
  dur?: unknown;
  duration?: unknown;
  audioUrl?: unknown;
  imageUrl?: unknown;
  artworkUrl?: unknown;
  fingerprint?: unknown;
  kind?: unknown;
  parentBeatId?: unknown;
}

export interface NormalizedBeatInput {
  title: string;
  genre: string;
  bpm: number | null;
  musicalKey: string | null;
  price: number;
  description: string | null;
  durationSec: number;
  audioUrl: string | null;
  imageUrl: string | null;
  fingerprint: string | null;
  kind: 'beat' | 'song';
  parentBeatId: string | null;
}

function toNumberOrNull(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toStringOrNull(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
}

/**
 * Accepts both `desc`/`description` and `dur`/`duration` on input.
 */
export function normalizeBeatInput(body: BeatInput): NormalizedBeatInput {
  const duration =
    toNumberOrNull(body.dur) ?? toNumberOrNull(body.duration) ?? 0;
  return {
    title: String(body.title ?? '').trim(),
    genre: String(body.genre ?? '').trim(),
    bpm: toNumberOrNull(body.bpm),
    musicalKey: toStringOrNull(body.key),
    price: Number(body.price ?? 0),
    description: toStringOrNull(body.desc ?? body.description),
    durationSec: Math.max(0, Math.round(duration)),
    audioUrl: toStringOrNull(body.audioUrl),
    imageUrl: toStringOrNull(body.imageUrl ?? body.artworkUrl),
    fingerprint: toStringOrNull(body.fingerprint),
    // Make-a-song: only 'song' is accepted; anything else is a plain beat.
    // parentBeatId is validated against a real beat by the controller.
    kind: String(body.kind ?? 'beat').trim().toLowerCase() === 'song' ? 'song' : 'beat',
    parentBeatId: toStringOrNull(body.parentBeatId),
  };
}
