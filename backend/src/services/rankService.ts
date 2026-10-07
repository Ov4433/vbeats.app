import { prisma } from '../db';

export interface BeatSalesRank {
  /** Completed sales for this beat. */
  sales: number;
  /**
   * Rank by beats sold (1 = best seller). Ties share the same rank:
   * 1 + the number of beats with strictly more sales. Beats with no
   * completed sales tie at rankedBeats + 1.
   */
  rank: number;
}

export interface SalesRanking {
  ranks: Map<string, BeatSalesRank>;
  /** Beats with at least one completed sale. */
  rankedBeats: number;
  totalBeats: number;
}

/**
 * Rank every beat by completed sales — the "back of the card" number.
 * One groupBy query, no N+1: callers look their beat(s) up in the map.
 */
export async function salesRanking(): Promise<SalesRanking> {
  const [groups, totalBeats] = await Promise.all([
    prisma.transaction.groupBy({
      by: ['beatId'],
      where: { status: 'completed' },
      _count: { beatId: true },
      orderBy: { _count: { beatId: 'desc' } },
    }),
    prisma.beat.count(),
  ]);

  const ranks = new Map<string, BeatSalesRank>();
  let prevSales: number | null = null;
  let prevRank = 0;
  groups.forEach((g, i) => {
    const sales = g._count.beatId;
    const rank = sales === prevSales ? prevRank : i + 1;
    prevSales = sales;
    prevRank = rank;
    ranks.set(g.beatId, { sales, rank });
  });

  return { ranks, rankedBeats: groups.length, totalBeats };
}

/** Rank entry for one beat; unsold beats tie just below the sellers. */
export function rankForBeat(
  ranking: SalesRanking,
  beatId: string
): BeatSalesRank {
  return (
    ranking.ranks.get(beatId) ?? {
      sales: 0,
      rank: ranking.rankedBeats + 1,
    }
  );
}
