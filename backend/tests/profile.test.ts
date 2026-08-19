import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { lockBalance } from '../src/escrow/lockBalance.js';
import { settleMatch } from '../src/escrow/settleMatch.js';
import { refundMatch } from '../src/escrow/refundMatch.js';
import { forfeitPlayer } from '../src/escrow/forfeitPlayer.js';
import { createMatch } from '../src/escrow/index.js';
import { TIERS, tierFor, tierProgress } from '../src/profile/tiers.js';
import {
  isReservedUsername,
  isValidUsername,
  normaliseUsername,
  parseUsername,
} from '../src/profile/username.js';
import { dailyNet, lifetimeStats, perGameStats } from '../src/profile/stats.js';
import { matchHistory } from '../src/profile/history.js';
import { toAmountString } from '../src/lib/money.js';
import { startTestDb, stopTestDb, clearTables, getTestPrisma } from './setup.js';

/**
 * Doc 11 — user profiles.
 *
 * Same discipline as escrow.test.ts and referral.test.ts: a real PostgreSQL with
 * the real migrations. Most of what is under test here IS a database guarantee —
 * the window-function streak query, the `gamesWon <= gamesPlayed` CHECK, the
 * username shape CHECK, and the exactness of NUMERIC aggregation. None of those
 * can be exercised against a mock.
 */

const db = () => getTestPrisma();

let userSeq = 0;
async function makeUser(available = '0') {
  userSeq += 1;
  return db().user.create({
    data: {
      walletAddress: `wallet-${userSeq}-${Math.random().toString(36).slice(2, 8)}`,
      availableBalance: available,
    },
  });
}

const sol = (v: string) => toAmountString(v);

/** Head-to-head pooled match; `winner` takes the post-fee pot. */
async function playPooled(
  a: { id: string },
  b: { id: string },
  stake: string,
  winner: { id: string } | null,
  gameType = 'test',
) {
  const matchId = await createMatch({ gameType, mode: 'pooled' });
  await lockBalance(a.id, stake, matchId);
  await lockBalance(b.id, stake, matchId);
  await settleMatch(matchId, winner ? [winner.id] : [], winner ? [1] : []);
  return matchId;
}

async function userRow(id: string) {
  return db().user.findUniqueOrThrow({ where: { id } });
}

beforeAll(startTestDb, 180_000);
afterAll(stopTestDb);
beforeEach(clearTables);

describe('tier ladder', () => {
  it('places a player on the highest rung they have reached', () => {
    expect(tierFor('0')).toBe('bronze');
    expect(tierFor('0.999999999')).toBe('bronze');
    expect(tierFor('1')).toBe('silver');
    expect(tierFor('9.999999999')).toBe('silver');
    expect(tierFor('10')).toBe('gold');
    expect(tierFor('49.999999999')).toBe('gold');
    expect(tierFor('50')).toBe('platinum');
    expect(tierFor('249.999999999')).toBe('platinum');
    expect(tierFor('250')).toBe('diamond');
    expect(tierFor('999999')).toBe('diamond');
  });

  it('treats a threshold as inclusive to the lamport', () => {
    // The whole reason thresholds are compared as Decimal and not as floats: one
    // lamport either side of a boundary has to land on the correct side.
    expect(tierFor('0.999999999')).toBe('bronze');
    expect(tierFor('1.000000000')).toBe('silver');
  });

  it('reports exact remaining progress, never a float', () => {
    const p = tierProgress('6.4');

    expect(p.key).toBe('silver');
    expect(p.level).toBe(2);
    expect(p.next?.key).toBe('gold');
    expect(p.remainingToNext).toBe(sol('3.6'));
    expect(p.wagered).toBe(sol('6.4'));
    // (6.4 - 1) / (10 - 1) = 60%
    expect(p.percentToNext).toBeCloseTo(60, 1);
  });

  it('caps out at the top of the ladder instead of dividing by nothing', () => {
    const p = tierProgress('10000');

    expect(p.key).toBe('diamond');
    expect(p.next).toBeNull();
    expect(p.remainingToNext).toBeNull();
    // 100, not 0 — a maxed bar must read as complete, not as empty.
    expect(p.percentToNext).toBe(100);
  });

  it('exposes the whole ladder with locked rungs marked', () => {
    const p = tierProgress('10');

    expect(p.ladder).toHaveLength(TIERS.length);
    expect(p.ladder.filter((r) => r.reached).map((r) => r.key)).toEqual([
      'bronze',
      'silver',
      'gold',
    ]);
    expect(p.ladder.filter((r) => !r.reached).map((r) => r.key)).toEqual([
      'platinum',
      'diamond',
    ]);
  });
});

describe('usernames', () => {
  it('normalises case and whitespace', () => {
    expect(normaliseUsername('  AliceCooper  ')).toBe('alicecooper');
    expect(parseUsername('  Alice_99 ')).toBe('alice_99');
  });

  it('accepts only the charset the URL and the CHECK constraint allow', () => {
    expect(isValidUsername('alice_99')).toBe(true);
    expect(isValidUsername('abc')).toBe(true);
    expect(isValidUsername('ab')).toBe(false);
    expect(isValidUsername('a'.repeat(21))).toBe(false);
    expect(isValidUsername('has space')).toBe(false);
    expect(isValidUsername('has-dash')).toBe(false);
    expect(isValidUsername('../../etc')).toBe(false);
  });

  it('refuses reserved handles that would collide with a route or impersonate', () => {
    expect(isReservedUsername('me')).toBe(true);
    expect(isReservedUsername('support')).toBe(true);
    expect(isReservedUsername('treasury')).toBe(true);
    expect(isReservedUsername('alice')).toBe(false);

    expect(() => parseUsername('support')).toThrow(/reserved/i);
  });

  it('is unique in the DATABASE, not merely in application code', async () => {
    const alice = await makeUser();
    const bob = await makeUser();

    await db().user.update({ where: { id: alice.id }, data: { username: 'taken' } });

    await expect(
      db().user.update({ where: { id: bob.id }, data: { username: 'taken' } }),
    ).rejects.toThrow();
  });

  it('rejects a malformed username at the database level too', async () => {
    const user = await makeUser();

    // Bypasses parseUsername entirely — the `users_username_shape` CHECK is what
    // must stop this, so a bug in a route can never store a broken URL segment.
    await expect(
      db().user.update({ where: { id: user.id }, data: { username: 'Bad-Name!' } }),
    ).rejects.toThrow();
  });

  it('lets many accounts have no username at all', async () => {
    // Nullable-unique: Postgres treats NULLs as distinct, which is what makes the
    // column addable with no backfill.
    const a = await makeUser();
    const b = await makeUser();

    expect(a.username).toBeNull();
    expect(b.username).toBeNull();
  });
});

describe('gamesWon', () => {
  it('counts a win for the winner and not for the loser', async () => {
    const alice = await makeUser('5');
    const bob = await makeUser('5');

    await playPooled(alice, bob, '1', alice);

    const a = await userRow(alice.id);
    const b = await userRow(bob.id);

    expect(a.gamesWon).toBe(1);
    expect(a.gamesPlayed).toBe(1);
    expect(b.gamesWon).toBe(0);
    expect(b.gamesPlayed).toBe(1);
  });

  it('counts no win for anyone on a draw', async () => {
    const alice = await makeUser('5');
    const bob = await makeUser('5');

    // No winner declared: stakes are returned and no fee is taken. Getting your
    // own stake back is not a win.
    await playPooled(alice, bob, '1', null);

    const a = await userRow(alice.id);
    const b = await userRow(bob.id);

    expect(a.gamesWon).toBe(0);
    expect(b.gamesWon).toBe(0);
    expect(a.gamesPlayed).toBe(1);
    expect(toAmountString(a.netProfit)).toBe(sol('0'));
  });
});

describe('stakeTotal', () => {
  it('survives settlement, unlike lockedAmount', async () => {
    const alice = await makeUser('5');
    const bob = await makeUser('5');

    const matchId = await playPooled(alice, bob, '1.5', alice);

    const row = await db().matchParticipant.findFirstOrThrow({
      where: { matchId, userId: alice.id },
    });

    // settleMatch zeroes lockedAmount — this is exactly why stakeTotal exists.
    expect(toAmountString(row.lockedAmount)).toBe(sol('0'));
    expect(toAmountString(row.stakeTotal)).toBe(sol('1.5'));
  });

  it('accumulates across multiple locks in one match', async () => {
    const alice = await makeUser('5');
    const matchId = await createMatch({ gameType: 'test', mode: 'solo_vs_house' });

    await lockBalance(alice.id, '1', matchId);
    await lockBalance(alice.id, '0.25', matchId);

    const row = await db().matchParticipant.findFirstOrThrow({
      where: { matchId, userId: alice.id },
    });
    expect(toAmountString(row.stakeTotal)).toBe(sol('1.25'));
  });
});

describe('forfeit counters (regression)', () => {
  it('counts a forfeited player exactly once, not twice', async () => {
    const alice = await makeUser('5');
    const bob = await makeUser('5');

    const matchId = await createMatch({ gameType: 'test', mode: 'pooled' });
    await lockBalance(alice.id, '1', matchId);
    await lockBalance(bob.id, '1', matchId);

    // Zero grace: forfeit immediately rather than waiting out the real 15s window.
    await forfeitPlayer(matchId, bob.id, 0);
    await settleMatch(matchId, [alice.id], [1]);

    const b = await userRow(bob.id);

    /**
     * Before this fix, forfeitPlayer counted the game and the loss, and then
     * settleMatch's loop over every participant counted BOTH again — 2 games
     * played and -2 SOL from a single 1 SOL forfeit. Nothing in the schema
     * catches that (gamesWon stays 0, so the gamesWon <= gamesPlayed CHECK is
     * satisfied), which is precisely why it needs a test.
     */
    expect(b.gamesPlayed).toBe(1);
    expect(b.gamesWon).toBe(0);
    expect(toAmountString(b.netProfit)).toBe(sol('-1'));
  });

  it('unwinds a forfeit when the match is later refunded', async () => {
    const alice = await makeUser('5');
    const bob = await makeUser('5');

    const matchId = await createMatch({ gameType: 'test', mode: 'pooled' });
    await lockBalance(alice.id, '1', matchId);
    await lockBalance(bob.id, '1', matchId);

    await forfeitPlayer(matchId, bob.id, 0);
    await refundMatch(matchId, 'server crash');

    const b = await userRow(bob.id);

    // A refunded match never happened — including in the statistics, not just in
    // the balance.
    expect(b.gamesPlayed).toBe(0);
    expect(toAmountString(b.netProfit)).toBe(sol('0'));
    expect(toAmountString(b.availableBalance)).toBe(sol('5'));
    expect(toAmountString(b.totalWagered)).toBe(sol('0'));
  });
});

describe('lifetimeStats', () => {
  it('returns zeros and a NULL win rate for a player who has never played', async () => {
    const alice = await makeUser('5');

    const stats = await lifetimeStats(alice.id);

    expect(stats.gamesPlayed).toBe(0);
    expect(stats.gamesWon).toBe(0);
    expect(stats.gamesLost).toBe(0);
    // null, not 0 and not NaN — there is no rate to report yet, and "0%" would
    // read as a record of losses nobody has actually suffered.
    expect(stats.winRate).toBeNull();
    expect(stats.biggestWin).toBe(sol('0'));
    expect(stats.biggestLoss).toBe(sol('0'));
    expect(stats.avgStake).toBe(sol('0'));
    expect(stats.currentStreak).toEqual({ kind: 'none', count: 0 });
    expect(stats.bestWinStreak).toBe(0);
  });

  it('splits wins and losses so the parts sum to gamesPlayed', async () => {
    const alice = await makeUser('10');
    const bob = await makeUser('10');

    await playPooled(alice, bob, '1', alice);
    await playPooled(alice, bob, '1', bob);
    await playPooled(alice, bob, '1', alice);

    const stats = await lifetimeStats(alice.id);

    expect(stats.gamesPlayed).toBe(3);
    expect(stats.gamesWon).toBe(2);
    expect(stats.gamesLost).toBe(1);
    expect(stats.gamesWon + stats.gamesLost + stats.gamesDrawn).toBe(stats.gamesPlayed);
    expect(stats.winRate).toBeCloseTo(66.7, 1);
  });

  it('reports the biggest win and biggest loss with the right signs', async () => {
    const alice = await makeUser('20');
    const bob = await makeUser('20');

    // 1 SOL each, 5% fee -> winner nets +0.9, loser -1.
    await playPooled(alice, bob, '1', alice);
    // 4 SOL each -> winner nets +3.6, loser -4.
    await playPooled(alice, bob, '4', bob);

    const stats = await lifetimeStats(alice.id);

    expect(stats.biggestWin).toBe(sol('0.9'));
    expect(stats.biggestLoss).toBe(sol('-4'));
    // A "biggest win" must never be negative even for a player who only ever lost.
    const loserOnly = await lifetimeStats(bob.id);
    expect(loserOnly.biggestWin).toBe(sol('3.6'));
  });

  it('never returns a negative biggest win for a player who only lost', async () => {
    const alice = await makeUser('10');
    const bob = await makeUser('10');

    await playPooled(alice, bob, '1', bob);

    const stats = await lifetimeStats(alice.id);
    expect(stats.biggestWin).toBe(sol('0'));
    expect(stats.biggestLoss).toBe(sol('-1'));
  });

  it('averages stakes that do not divide evenly without throwing', async () => {
    const alice = await makeUser('10');
    const bob = await makeUser('10');

    // 1 and 2 average to 1.5; three matches of 1/1/2 average to 1.333333333…,
    // which has more than 9 decimal places before ROUND(). Unrounded this throws
    // in toDecimal and 500s the endpoint.
    await playPooled(alice, bob, '1', alice);
    await playPooled(alice, bob, '1', alice);
    await playPooled(alice, bob, '2', alice);

    const stats = await lifetimeStats(alice.id);
    expect(stats.avgStake).toBe(sol('1.333333333'));
  });

  it('rolls up deposits, withdrawals and referral earnings off the ledger', async () => {
    const alice = await makeUser('0');

    await db().ledgerEntry.createMany({
      data: [
        { userId: alice.id, type: 'deposit', status: 'confirmed', amount: '2' },
        { userId: alice.id, type: 'deposit', status: 'confirmed', amount: '3' },
        // Pending must not count — the money has not arrived.
        { userId: alice.id, type: 'deposit', status: 'pending', amount: '9' },
        { userId: alice.id, type: 'withdrawal', status: 'confirmed', amount: '-1.5' },
        { userId: alice.id, type: 'referral', status: 'confirmed', amount: '0.25' },
      ],
    });

    const stats = await lifetimeStats(alice.id);

    expect(stats.totalDeposited).toBe(sol('5'));
    // Stored negative, displayed as a positive quantity.
    expect(stats.totalWithdrawn).toBe(sol('1.5'));
    expect(stats.referralEarnings).toBe(sol('0.25'));
  });
});

describe('streaks', () => {
  it('reports the current run and the best win run', async () => {
    const alice = await makeUser('20');
    const bob = await makeUser('20');

    // W W L W W W  ->  current +3, best 3
    await playPooled(alice, bob, '1', alice);
    await playPooled(alice, bob, '1', alice);
    await playPooled(alice, bob, '1', bob);
    await playPooled(alice, bob, '1', alice);
    await playPooled(alice, bob, '1', alice);
    await playPooled(alice, bob, '1', alice);

    const stats = await lifetimeStats(alice.id);

    expect(stats.currentStreak).toEqual({ kind: 'win', count: 3 });
    expect(stats.bestWinStreak).toBe(3);
  });

  it('reports a losing run as a loss streak', async () => {
    const alice = await makeUser('20');
    const bob = await makeUser('20');

    await playPooled(alice, bob, '1', alice);
    await playPooled(alice, bob, '1', bob);
    await playPooled(alice, bob, '1', bob);

    const stats = await lifetimeStats(alice.id);

    expect(stats.currentStreak).toEqual({ kind: 'loss', count: 2 });
    expect(stats.bestWinStreak).toBe(1);
  });

  it('is stable across repeated calls on identical data', async () => {
    const alice = await makeUser('20');
    const bob = await makeUser('20');

    // Settled back-to-back, so several matches can share a settledAt millisecond.
    // Without the `m.id` tie-break the run boundaries would shift between reads.
    for (let i = 0; i < 5; i += 1) await playPooled(alice, bob, '1', alice);

    const first = await lifetimeStats(alice.id);
    const second = await lifetimeStats(alice.id);

    expect(first.currentStreak).toEqual(second.currentStreak);
    expect(first.bestWinStreak).toBe(second.bestWinStreak);
  });
});

describe('perGameStats', () => {
  it('splits the record by gameType', async () => {
    const alice = await makeUser('20');
    const bob = await makeUser('20');

    await playPooled(alice, bob, '1', alice, 'coin-flip');
    await playPooled(alice, bob, '1', bob, 'coin-flip');
    await playPooled(alice, bob, '2', alice, 'dice');

    const rows = await perGameStats(alice.id);
    const byGame = new Map(rows.map((r) => [r.gameType, r]));

    expect(byGame.get('coin-flip')).toMatchObject({ played: 2, won: 1, lost: 1 });
    expect(byGame.get('dice')).toMatchObject({ played: 1, won: 1, lost: 0 });
    expect(byGame.get('dice')!.wagered).toBe(sol('2'));
    expect(byGame.get('dice')!.netProfit).toBe(sol('1.8'));
  });

  it('is empty for a player with no matches', async () => {
    const alice = await makeUser();
    expect(await perGameStats(alice.id)).toEqual([]);
  });
});

describe('dailyNet', () => {
  it('always returns one row per day, even with no history', async () => {
    const alice = await makeUser();

    const curve = await dailyNet(alice.id, 30);

    // A stable axis is the point: the chart draws an honest flat line rather than
    // collapsing to a single point or an empty box.
    expect(curve).toHaveLength(30);
    expect(curve.every((d) => d.net === sol('0') && d.games === 0)).toBe(true);
    expect(curve[0]!.day < curve[29]!.day).toBe(true);
  });

  it('lands today’s matches on today’s bucket', async () => {
    const alice = await makeUser('10');
    const bob = await makeUser('10');

    await playPooled(alice, bob, '1', alice);

    const curve = await dailyNet(alice.id, 30);
    const today = curve[curve.length - 1]!;

    expect(today.games).toBe(1);
    expect(today.net).toBe(sol('0.9'));
  });
});

describe('matchHistory', () => {
  it('returns one row per match with stake, payout and net', async () => {
    const alice = await makeUser('10');
    const bob = await makeUser('10');

    await playPooled(alice, bob, '1', alice);

    const page = await matchHistory(alice.id, 1, 20);

    expect(page.total).toBe(1);
    expect(page.entries).toHaveLength(1);
    expect(page.entries[0]).toMatchObject({
      gameType: 'test',
      mode: 'pooled',
      result: 'won',
      stake: sol('1'),
      payout: sol('1.9'),
      net: sol('0.9'),
      pot: sol('2'),
    });
    expect(page.entries[0]!.settledAt).not.toBeNull();
  });

  it('labels a refund as refunded, not as a draw', async () => {
    const alice = await makeUser('10');
    const bob = await makeUser('10');

    const matchId = await createMatch({ gameType: 'test', mode: 'pooled' });
    await lockBalance(alice.id, '1', matchId);
    await lockBalance(bob.id, '1', matchId);
    await refundMatch(matchId, 'server crash');

    const page = await matchHistory(alice.id, 1, 20);

    /**
     * refundMatch sets payout to the full stake, so a refund is NUMERICALLY
     * identical to a draw. This is the guard for classifying on status first.
     */
    expect(page.entries[0]!.result).toBe('refunded');
    expect(page.entries[0]!.payout).toBe(page.entries[0]!.stake);
    void matchId;
  });

  it('labels a forfeit as forfeited', async () => {
    const alice = await makeUser('10');
    const bob = await makeUser('10');

    const matchId = await createMatch({ gameType: 'test', mode: 'pooled' });
    await lockBalance(alice.id, '1', matchId);
    await lockBalance(bob.id, '1', matchId);
    await forfeitPlayer(matchId, bob.id, 0);
    await settleMatch(matchId, [alice.id], [1]);

    const page = await matchHistory(bob.id, 1, 20);
    expect(page.entries[0]!.result).toBe('forfeited');
  });

  it('labels a draw as a draw', async () => {
    const alice = await makeUser('10');
    const bob = await makeUser('10');

    await playPooled(alice, bob, '1', null);

    const page = await matchHistory(alice.id, 1, 20);
    expect(page.entries[0]!.result).toBe('draw');
    expect(page.entries[0]!.net).toBe(sol('0'));
  });

  it('shows an open match before it settles', async () => {
    const alice = await makeUser('10');

    const matchId = await createMatch({ gameType: 'test', mode: 'solo_vs_house' });
    await lockBalance(alice.id, '1', matchId);

    const page = await matchHistory(alice.id, 1, 20);

    expect(page.entries[0]!.result).toBe('open');
    expect(page.entries[0]!.settledAt).toBeNull();
    expect(page.entries[0]!.stake).toBe(sol('1'));
  });

  it('paginates without dropping or duplicating a row', async () => {
    const alice = await makeUser('50');
    const bob = await makeUser('50');

    for (let i = 0; i < 5; i += 1) await playPooled(alice, bob, '1', alice);

    const first = await matchHistory(alice.id, 1, 2);
    const second = await matchHistory(alice.id, 2, 2);
    const third = await matchHistory(alice.id, 3, 2);

    expect(first.total).toBe(5);
    expect(first.entries).toHaveLength(2);
    expect(second.entries).toHaveLength(2);
    expect(third.entries).toHaveLength(1);

    const ids = [...first.entries, ...second.entries, ...third.entries].map((e) => e.matchId);
    expect(new Set(ids).size).toBe(5);
  });

  it('clamps an absurd limit rather than trusting it', async () => {
    const alice = await makeUser();
    const page = await matchHistory(alice.id, 1, 10_000);
    expect(page.limit).toBe(100);
  });
});
