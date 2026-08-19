import { prisma } from '../config/db.js';
import { toAmountString } from '../lib/money.js';

/**
 * Doc 11 — the numbers behind a profile page.
 *
 * TWO RULES GOVERN EVERY QUERY IN THIS FILE.
 *
 * 1. Aggregation happens in PostgreSQL, not in JavaScript. Pulling every match a
 *    player has ever played into memory to count them is both slower and, for
 *    money, wrong — see rule 2.
 *
 * 2. Every money expression is cast `::text` in SQL. `@prisma/adapter-pg` does
 *    not promise whether a raw `NUMERIC` arrives as a string or a Decimal, and
 *    `Number(someBalance)` is a bug by the standards of lib/money.ts. Casting in
 *    SQL removes the ambiguity at the source; the value then goes through
 *    `toAmountString` on the way out and never becomes a float.
 *
 * A NOTE ON `AVG`: Postgres `AVG` over NUMERIC performs division, which can
 * produce more than 9 decimal places — and `toDecimal` THROWS on anything with
 * more precision than SOL can represent. So every average is wrapped in
 * `ROUND(…, 9)`. Without it, one player with an awkward stake 500s the endpoint.
 *
 * CLASSIFYING A RESULT — the order matters:
 *   refunded  -> the match or the participant was refunded
 *   forfeited -> the participant failed to reconnect
 *   won/lost  -> payout vs stakeTotal
 *   draw      -> payout exactly equals stakeTotal
 * Status must be checked BEFORE comparing payout to stake, because `refundMatch`
 * sets `payout` to the full stake — so a refund looks exactly like a draw to a
 * query that only compares numbers.
 */

export interface LifetimeStats {
  gamesPlayed: number;
  gamesWon: number;
  gamesLost: number;
  gamesDrawn: number;
  gamesForfeited: number;
  /** Percent with one decimal, or null for a player who has never finished a match. */
  winRate: number | null;
  /** All exact SOL decimal strings. */
  totalWagered: string;
  netProfit: string;
  biggestWin: string;
  biggestLoss: string;
  avgStake: string;
  totalDeposited: string;
  totalWithdrawn: string;
  referralEarnings: string;
  currentStreak: { kind: 'win' | 'loss' | 'none'; count: number };
  bestWinStreak: number;
}

export interface PerGameStat {
  gameType: string;
  played: number;
  won: number;
  lost: number;
  wagered: string;
  netProfit: string;
}

export interface DailyNet {
  /** ISO date, YYYY-MM-DD. */
  day: string;
  net: string;
  games: number;
}

interface SettledAggregate {
  played: number;
  won: number;
  lost: number;
  drawn: number;
  forfeited: number;
  biggestWin: string;
  biggestLoss: string;
  avgStake: string;
}

/** A "biggest win" must never display a loss, and vice versa. */
const clampPositive = (v: string): string => toAmountString(v.startsWith('-') ? '0' : v);
const clampNegative = (v: string): string => toAmountString(v.startsWith('-') ? v : '0');

/**
 * Counts and extremes over every settled match.
 *
 * `mp.status <> 'refunded'` excludes a match that was settled and then refunded;
 * such a match never happened, and counting it would contradict the lifetime
 * counters on `users`, which `refundMatch` unwinds.
 */
async function settledAggregate(userId: string): Promise<SettledAggregate> {
  const rows = await prisma.$queryRaw<
    {
      played: number;
      won: number;
      lost: number;
      drawn: number;
      forfeited: number;
      biggestwin: string;
      biggestloss: string;
      avgstake: string;
    }[]
  >`
    SELECT
      COUNT(*)::int                                              AS played,
      COUNT(*) FILTER (WHERE mp.payout > mp."stakeTotal")::int    AS won,
      COUNT(*) FILTER (WHERE mp.payout < mp."stakeTotal")::int    AS lost,
      COUNT(*) FILTER (WHERE mp.payout = mp."stakeTotal"
                         AND mp.status <> 'forfeited')::int       AS drawn,
      COUNT(*) FILTER (WHERE mp.status = 'forfeited')::int        AS forfeited,
      COALESCE(MAX(mp.payout - mp."stakeTotal"), 0)::text         AS biggestwin,
      COALESCE(MIN(mp.payout - mp."stakeTotal"), 0)::text         AS biggestloss,
      COALESCE(ROUND(AVG(mp."stakeTotal"), 9), 0)::text           AS avgstake
    FROM match_participants mp
    JOIN matches m ON m.id = mp."matchId"
    WHERE mp."userId" = ${userId}::uuid
      AND m.status = 'settled'
      AND mp.status <> 'refunded'
  `;

  const r = rows[0];
  return {
    played: r?.played ?? 0,
    won: r?.won ?? 0,
    lost: r?.lost ?? 0,
    drawn: r?.drawn ?? 0,
    forfeited: r?.forfeited ?? 0,
    // MAX over a set of losses is still negative, MIN over a set of wins still
    // positive — clamp both rather than showing a "biggest win" of -0.5 SOL.
    biggestWin: clampPositive(r?.biggestwin ?? '0'),
    biggestLoss: clampNegative(r?.biggestloss ?? '0'),
    avgStake: toAmountString(r?.avgstake ?? '0'),
  };
}

/** Confirmed deposit / withdrawal / referral totals, straight off the ledger. */
async function ledgerTotals(userId: string): Promise<{
  totalDeposited: string;
  totalWithdrawn: string;
  referralEarnings: string;
}> {
  const rows = await prisma.$queryRaw<{ type: string; total: string }[]>`
    SELECT "type"::text AS type, COALESCE(SUM("amount"), 0)::text AS total
      FROM ledger_entries
     WHERE "userId" = ${userId}::uuid
       AND "status" = 'confirmed'
       AND "type" IN ('deposit', 'withdrawal', 'referral')
     GROUP BY "type"
  `;

  const byType = new Map(rows.map((r) => [r.type, r.total]));

  // A withdrawal is stored negative (signed from the player's perspective), but
  // "total withdrawn" reads as a positive quantity on a profile.
  const withdrawn = byType.get('withdrawal') ?? '0';

  return {
    totalDeposited: toAmountString(byType.get('deposit') ?? '0'),
    totalWithdrawn: toAmountString(withdrawn.startsWith('-') ? withdrawn.slice(1) : withdrawn),
    referralEarnings: toAmountString(byType.get('referral') ?? '0'),
  };
}

/**
 * Current and best win streak, derived on read.
 *
 * DERIVED, NOT STORED, deliberately. Stored counters would have to be maintained
 * in three separate escrow files (`settleMatch`, `forfeitPlayer`, `refundMatch`),
 * and once any one of them drifted the number would be silently wrong forever
 * with no way to recompute it. This query cannot drift: it reads the matches.
 *
 * The classic gaps-and-islands shape — subtracting a per-outcome row number from
 * a global one gives every consecutive run of the same outcome a constant key.
 *
 * `ORDER BY m."settledAt", m.id` — the `m.id` tie-break matters. Two matches can
 * settle inside the same millisecond, and without a deterministic second key the
 * displayed streak would flicker between requests on identical data.
 */
async function streaks(userId: string): Promise<{
  currentStreak: { kind: 'win' | 'loss' | 'none'; count: number };
  bestWinStreak: number;
}> {
  const runs = await prisma.$queryRaw<{ won: boolean; len: number; last_rn: number }[]>`
    WITH h AS (
      SELECT mp.payout > mp."stakeTotal" AS won,
             ROW_NUMBER() OVER (ORDER BY m."settledAt", m.id) AS rn
        FROM match_participants mp
        JOIN matches m ON m.id = mp."matchId"
       WHERE mp."userId" = ${userId}::uuid
         AND m.status = 'settled'
         AND m."settledAt" IS NOT NULL
         AND mp.status <> 'refunded'
    ), grouped AS (
      SELECT won, rn, rn - ROW_NUMBER() OVER (PARTITION BY won ORDER BY rn) AS island
        FROM h
    )
    SELECT won, COUNT(*)::int AS len, MAX(rn)::int AS last_rn
      FROM grouped
     GROUP BY won, island
     ORDER BY last_rn DESC
  `;

  const latest = runs[0];
  const bestWinStreak = runs.filter((r) => r.won).reduce((best, r) => Math.max(best, r.len), 0);

  return {
    currentStreak: latest
      ? { kind: latest.won ? 'win' : 'loss', count: latest.len }
      : { kind: 'none', count: 0 },
    bestWinStreak,
  };
}

/**
 * Everything the profile's stat grid renders.
 *
 * The lifetime figures on `users` (`gamesPlayed`, `gamesWon`, `totalWagered`,
 * `netProfit`) are AUTHORITATIVE and read straight off the row — escrow maintains
 * them transactionally alongside the balances they derive from. The per-match
 * aggregate supplies what no counter records: the split, the extremes, the
 * average. Losses are derived by SUBTRACTION from the authoritative total rather
 * than counted independently, so the parts always sum to the whole instead of two
 * sources disagreeing on the profile page.
 */
export async function lifetimeStats(userId: string): Promise<LifetimeStats> {
  const [user, agg, ledger, streak] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { gamesPlayed: true, gamesWon: true, totalWagered: true, netProfit: true },
    }),
    settledAggregate(userId),
    ledgerTotals(userId),
    streaks(userId),
  ]);

  const played = user.gamesPlayed;
  const won = user.gamesWon;
  const lost = Math.max(0, played - won - agg.drawn);

  return {
    gamesPlayed: played,
    gamesWon: won,
    gamesLost: lost,
    gamesDrawn: agg.drawn,
    gamesForfeited: agg.forfeited,
    // null, not 0 — a player who has never finished a match has no win rate, and
    // "0%" would read as a record of failure they have not earned.
    winRate: played === 0 ? null : Number(((won / played) * 100).toFixed(1)),
    totalWagered: toAmountString(user.totalWagered),
    netProfit: toAmountString(user.netProfit),
    biggestWin: agg.biggestWin,
    biggestLoss: agg.biggestLoss,
    avgStake: agg.avgStake,
    ...ledger,
    ...streak,
  };
}

/** The same figures, split by game. Empty until the first game module ships. */
export async function perGameStats(userId: string): Promise<PerGameStat[]> {
  const rows = await prisma.$queryRaw<
    { gametype: string; played: number; won: number; lost: number; wagered: string; net: string }[]
  >`
    SELECT m."gameType"                                            AS gametype,
           COUNT(*)::int                                           AS played,
           COUNT(*) FILTER (WHERE mp.payout > mp."stakeTotal")::int AS won,
           COUNT(*) FILTER (WHERE mp.payout < mp."stakeTotal")::int AS lost,
           COALESCE(SUM(mp."stakeTotal"), 0)::text                  AS wagered,
           COALESCE(SUM(mp.payout - mp."stakeTotal"), 0)::text      AS net
      FROM match_participants mp
      JOIN matches m ON m.id = mp."matchId"
     WHERE mp."userId" = ${userId}::uuid
       AND m.status = 'settled'
       AND mp.status <> 'refunded'
     GROUP BY m."gameType"
     ORDER BY played DESC, m."gameType" ASC
  `;

  return rows.map((r) => ({
    gameType: r.gametype,
    played: r.played,
    won: r.won,
    lost: r.lost,
    wagered: toAmountString(r.wagered),
    netProfit: toAmountString(r.net),
  }));
}

/**
 * Net profit per day for the profit curve.
 *
 * `generate_series` LEFT JOINed to the matches means this ALWAYS returns `days`
 * rows, even for a player with no history. That is what lets the chart draw a
 * stable axis and an honest flat line at zero, instead of collapsing to a single
 * point or an empty box.
 */
export async function dailyNet(userId: string, days = 30): Promise<DailyNet[]> {
  const rows = await prisma.$queryRaw<{ day: string; net: string; games: number }[]>`
    SELECT to_char(d::date, 'YYYY-MM-DD')                        AS day,
           COALESCE(SUM(mp.payout - mp."stakeTotal"), 0)::text    AS net,
           COUNT(mp.id)::int                                      AS games
      FROM generate_series(
             CURRENT_DATE - MAKE_INTERVAL(days => ${days - 1}),
             CURRENT_DATE,
             INTERVAL '1 day'
           ) AS d
      LEFT JOIN matches m
             ON m.status = 'settled'
            AND m."settledAt" >= d
            AND m."settledAt" <  d + INTERVAL '1 day'
      LEFT JOIN match_participants mp
             ON mp."matchId" = m.id
            AND mp."userId"  = ${userId}::uuid
            AND mp.status   <> 'refunded'
     GROUP BY d
     ORDER BY d ASC
  `;

  return rows.map((r) => ({ day: r.day, net: toAmountString(r.net), games: r.games }));
}
