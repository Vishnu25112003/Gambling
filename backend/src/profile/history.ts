import { prisma } from '../config/db.js';
import { toAmountString } from '../lib/money.js';

/**
 * Doc 11 — per-match history: the "inside details", not just a count.
 *
 * One row per match this player took part in, carrying what they staked, what
 * came back, and the net — which is only answerable because `lockBalance` records
 * `stakeTotal` and never reduces it (`settleMatch` zeroes `lockedAmount`).
 *
 * This is a different question from `/api/wallet/history`, which lists LEDGER
 * ENTRIES — several rows per match (a lock, a settlement, maybe a fee). This is
 * one row per match, from the player's point of view.
 */

export type MatchResult = 'won' | 'lost' | 'draw' | 'refunded' | 'forfeited' | 'open';

export interface MatchHistoryRow {
  matchId: string;
  gameType: string;
  mode: 'pooled' | 'solo_vs_house';
  result: MatchResult;
  /** Exact SOL decimal strings. */
  stake: string;
  payout: string;
  net: string;
  pot: string;
  /** Settle time, or null while the match is still open. */
  settledAt: string | null;
  joinedAt: string;
}

export interface MatchHistoryPage {
  page: number;
  limit: number;
  total: number;
  entries: MatchHistoryRow[];
}

export const HISTORY_MAX_LIMIT = 100;
export const HISTORY_DEFAULT_LIMIT = 20;

interface RawRow {
  matchid: string;
  gametype: string;
  mode: string;
  matchstatus: string;
  participantstatus: string;
  stake: string;
  payout: string;
  net: string;
  pot: string;
  settledat: Date | null;
  joinedat: Date;
}

/**
 * Classify one row. ORDER IS LOAD-BEARING.
 *
 * `refundMatch` sets `payout` to the full stake, so a refund is numerically
 * identical to a draw. Status has to be consulted before the amounts are
 * compared, or every crash-refund in a player's history would be mislabelled as a
 * drawn game.
 */
function classify(row: RawRow): MatchResult {
  if (row.matchstatus === 'refunded' || row.participantstatus === 'refunded') return 'refunded';
  if (row.participantstatus === 'forfeited') return 'forfeited';
  if (row.matchstatus === 'open') return 'open';

  // String comparison is not enough (`"10" < "9"`), and these are money, so they
  // must not become floats either. The SQL already computed the difference
  // exactly; its sign is all that is needed here.
  if (row.net.startsWith('-')) return 'lost';
  if (Number.parseFloat(row.net) === 0) return 'draw';
  return 'won';
}

/**
 * A page of match history, newest first.
 *
 * Ordered by `COALESCE(m."settledAt", mp."joinedAt")` so an open match sorts by
 * when it was joined and still appears at the top where the player expects it,
 * rather than sinking to the bottom behind a NULL. `m.id` breaks ties so
 * pagination is stable — without it, two matches settled in the same millisecond
 * could appear on both page 1 and page 2, or on neither.
 */
export async function matchHistory(
  userId: string,
  page = 1,
  limit = HISTORY_DEFAULT_LIMIT,
): Promise<MatchHistoryPage> {
  const safeLimit = Math.min(Math.max(1, Math.trunc(limit)), HISTORY_MAX_LIMIT);
  const safePage = Math.max(1, Math.trunc(page));
  const offset = (safePage - 1) * safeLimit;

  const [rows, counted] = await Promise.all([
    prisma.$queryRaw<RawRow[]>`
      SELECT m.id::text                                     AS matchid,
             m."gameType"                                    AS gametype,
             m.mode::text                                    AS mode,
             m.status::text                                  AS matchstatus,
             mp.status::text                                 AS participantstatus,
             mp."stakeTotal"::text                           AS stake,
             mp.payout::text                                 AS payout,
             (mp.payout - mp."stakeTotal")::text             AS net,
             m.pot::text                                     AS pot,
             m."settledAt"                                   AS settledat,
             mp."joinedAt"                                   AS joinedat
        FROM match_participants mp
        JOIN matches m ON m.id = mp."matchId"
       WHERE mp."userId" = ${userId}::uuid
       ORDER BY COALESCE(m."settledAt", mp."joinedAt") DESC, m.id DESC
       LIMIT ${safeLimit} OFFSET ${offset}
    `,
    prisma.matchParticipant.count({ where: { userId } }),
  ]);

  return {
    page: safePage,
    limit: safeLimit,
    total: counted,
    entries: rows.map((row) => ({
      matchId: row.matchid,
      gameType: row.gametype,
      mode: row.mode as MatchHistoryRow['mode'],
      result: classify(row),
      stake: toAmountString(row.stake),
      payout: toAmountString(row.payout),
      net: toAmountString(row.net),
      pot: toAmountString(row.pot),
      settledAt: row.settledat ? row.settledat.toISOString() : null,
      joinedAt: row.joinedat.toISOString(),
    })),
  };
}
