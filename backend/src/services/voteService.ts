import { prisma } from '../db';
import {
  checkHolding as defaultCheckHolding,
  getPassState as defaultGetPassState,
} from './passService';

// ---------------------------------------------------------------------------
// Vote weights
//
// A vote's weight is snapshotted at vote time from the voter's wallet:
//   3 — Volt Pass holder (VoltPass on Base, via passService.getPassState)
//   2 — VBEATS holder at/above the pass threshold (Robinhood Chain,
//       via passService.checkHolding)
//   1 — everyone else (including voters with no wallet)
// Chain reads are best-effort: any failure warns and degrades gracefully,
// and computeVoteWeight NEVER throws.
// ---------------------------------------------------------------------------

export interface VoteWeightReaders {
  getPassState: typeof defaultGetPassState;
  checkHolding: typeof defaultCheckHolding;
}

/**
 * Pure weight decision — separable so it can be unit-tested without any
 * chain access. Pass beats holding; holding beats plain.
 */
export function decideWeight(input: {
  hasPass: boolean;
  eligible: boolean;
}): number {
  if (input.hasPass) return 3;
  if (input.eligible) return 2;
  return 1;
}

export async function computeVoteWeight(
  walletAddress: string | null,
  readers: Partial<VoteWeightReaders> = {}
): Promise<number> {
  if (!walletAddress) return 1;
  const getPassState = readers.getPassState ?? defaultGetPassState;
  const checkHolding = readers.checkHolding ?? defaultCheckHolding;

  let hasPass = false;
  try {
    const state = await getPassState(walletAddress);
    hasPass = Boolean(state?.hasPass);
  } catch (err) {
    console.warn(
      '[votes] getPassState failed, falling back to holding check:',
      err instanceof Error ? err.message : err
    );
  }
  if (hasPass) return decideWeight({ hasPass: true, eligible: false });

  let eligible = false;
  try {
    const holding = await checkHolding(walletAddress);
    eligible = Boolean(holding?.eligible);
  } catch (err) {
    console.warn(
      '[votes] checkHolding failed, falling back to weight 1:',
      err instanceof Error ? err.message : err
    );
  }
  return decideWeight({ hasPass: false, eligible });
}

// ---------------------------------------------------------------------------
// Aggregates (rankService style: one groupBy, callers look up the map)
// ---------------------------------------------------------------------------

export interface VoteTotal {
  totalWeight: number;
  count: number;
}

export async function voteTotals(
  beatIds?: string[]
): Promise<Map<string, VoteTotal>> {
  if (beatIds && beatIds.length === 0) return new Map();
  const groups = await prisma.vote.groupBy({
    by: ['beatId'],
    where: beatIds ? { beatId: { in: beatIds } } : undefined,
    _sum: { weight: true },
    _count: { beatId: true },
  });
  return new Map(
    groups.map((g) => [
      g.beatId,
      { totalWeight: g._sum.weight ?? 0, count: g._count.beatId },
    ])
  );
}

export async function votedBeatIds(
  userId: string,
  beatIds: string[]
): Promise<Set<string>> {
  if (beatIds.length === 0) return new Set();
  const votes = await prisma.vote.findMany({
    where: { userId, beatId: { in: beatIds } },
    select: { beatId: true },
  });
  return new Set(votes.map((v) => v.beatId));
}

// ---------------------------------------------------------------------------
// Weekly window — Mon 00:00:00.000 UTC through the following Monday
// (end exclusive), i.e. the Mon–Sun UTC week containing `now`.
// ---------------------------------------------------------------------------

export function weekWindowUtc(now: Date = new Date()): {
  start: Date;
  end: Date;
} {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  // getUTCDay: 0=Sun..6=Sat. Days since Monday: Mon=0, Tue=1, ..., Sun=6.
  const daysSinceMonday = (start.getUTCDay() + 6) % 7;
  start.setUTCDate(start.getUTCDate() - daysSinceMonday);
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  return { start, end };
}

// ---------------------------------------------------------------------------
// Top-voted rankings
// ---------------------------------------------------------------------------

export interface RankedVote {
  beatId: string;
  totalWeight: number;
  count: number;
}

interface RankableGroup {
  beatId: string;
  _sum: { weight: number | null };
  _count: { beatId: number };
  _min: { createdAt: Date | null };
}

function rankGroups(groups: RankableGroup[], limit: number): RankedVote[] {
  return groups
    .map((g) => ({
      beatId: g.beatId,
      totalWeight: g._sum.weight ?? 0,
      count: g._count.beatId,
      firstVoteAt: g._min.createdAt?.getTime() ?? Number.POSITIVE_INFINITY,
    }))
    .sort(
      (a, b) =>
        b.totalWeight - a.totalWeight ||
        b.count - a.count ||
        a.firstVoteAt - b.firstVoteAt
    )
    .slice(0, limit)
    .map(({ beatId, totalWeight, count }) => ({ beatId, totalWeight, count }));
}

export async function topVoted(limit = 10): Promise<{
  week: { start: Date; end: Date };
  weekList: RankedVote[];
  allTimeList: RankedVote[];
}> {
  const week = weekWindowUtc();
  const [weekGroups, allTimeGroups] = await Promise.all([
    prisma.vote.groupBy({
      by: ['beatId'],
      where: { createdAt: { gte: week.start, lt: week.end } },
      _sum: { weight: true },
      _count: { beatId: true },
      _min: { createdAt: true },
    }),
    prisma.vote.groupBy({
      by: ['beatId'],
      _sum: { weight: true },
      _count: { beatId: true },
      _min: { createdAt: true },
    }),
  ]);
  return {
    week,
    weekList: rankGroups(weekGroups as RankableGroup[], limit),
    allTimeList: rankGroups(allTimeGroups as RankableGroup[], limit),
  };
}
