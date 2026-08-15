import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { lockBalance } from '../src/escrow/lockBalance.js';
import { settleMatch } from '../src/escrow/settleMatch.js';
import { refundMatch } from '../src/escrow/refundMatch.js';
import {
  forfeitPlayer,
  cancelForfeit,
  clearAllForfeitTimers,
} from '../src/escrow/forfeitPlayer.js';
import { createMatch } from '../src/escrow/index.js';
import { toAmountString } from '../src/lib/money.js';
import { startTestDb, stopTestDb, clearTables, getTestPrisma } from './setup.js';

const db = () => getTestPrisma();

let userSeq = 0;
async function makeUser(available: string) {
  userSeq += 1;
  return db().user.create({
    data: { walletAddress: `wallet-${userSeq}-${Math.random().toString(36).slice(2, 8)}`, availableBalance: available },
  });
}

async function balancesOf(id: string) {
  const u = await db().user.findUniqueOrThrow({ where: { id } });
  return {
    available: toAmountString(u.availableBalance),
    locked: toAmountString(u.lockedBalance),
  };
}

const sol = (v: string) => toAmountString(v);

beforeAll(startTestDb, 180_000);
afterAll(async () => {
  clearAllForfeitTimers();
  await stopTestDb();
});
beforeEach(async () => {
  clearAllForfeitTimers();
  await clearTables();
});

describe('lockBalance', () => {
  it('moves funds from available to locked', async () => {
    const user = await makeUser('2');
    const matchId = await createMatch({ gameType: 'test', mode: 'pooled' });

    await lockBalance(user.id, '1', matchId);

    expect(await balancesOf(user.id)).toEqual({ available: sol('1'), locked: sol('1') });
  });

  it('records the stake on the match and grows the pot', async () => {
    const user = await makeUser('2');
    const matchId = await createMatch({ gameType: 'test', mode: 'pooled' });
    await lockBalance(user.id, '1', matchId);

    const match = await db().match.findUniqueOrThrow({
      where: { id: matchId },
      include: { participants: true },
    });
    expect(toAmountString(match.pot)).toBe(sol('1'));
    expect(match.participants).toHaveLength(1);
    expect(toAmountString(match.participants[0]!.lockedAmount)).toBe(sol('1'));
  });

  it('accumulates onto one participant row when a player bets twice', async () => {
    const user = await makeUser('3');
    const matchId = await createMatch({ gameType: 'test', mode: 'pooled' });
    await lockBalance(user.id, '1', matchId);
    await lockBalance(user.id, '0.5', matchId);

    const participants = await db().matchParticipant.findMany({ where: { matchId } });
    expect(participants).toHaveLength(1);
    expect(toAmountString(participants[0]!.lockedAmount)).toBe(sol('1.5'));
  });

  it('refuses a bet larger than the available balance', async () => {
    const user = await makeUser('0.5');
    const matchId = await createMatch({ gameType: 'test', mode: 'pooled' });

    await expect(lockBalance(user.id, '1', matchId)).rejects.toThrow(/enough available/i);
    expect(await balancesOf(user.id)).toEqual({ available: sol('0.5'), locked: sol('0') });
  });

  it('rejects zero, negative and sub-lamport bets', async () => {
    const user = await makeUser('1');
    const matchId = await createMatch({ gameType: 'test', mode: 'pooled' });

    await expect(lockBalance(user.id, '0', matchId)).rejects.toThrow();
    await expect(lockBalance(user.id, '-1', matchId)).rejects.toThrow();
    await expect(lockBalance(user.id, '0.0000000001', matchId)).rejects.toThrow();
  });

  it('cannot overdraw under concurrent bets — the conditional UPDATE holds', async () => {
    // THE race condition doc 03 calls out. Ten simultaneous 1-SOL bets against
    // a 5 SOL balance: a read-then-write would let all ten through.
    const user = await makeUser('5');
    const matchId = await createMatch({ gameType: 'test', mode: 'pooled' });

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => lockBalance(user.id, '1', matchId)),
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    expect(succeeded).toBe(5);
    expect(await balancesOf(user.id)).toEqual({ available: sol('0'), locked: sol('5') });
  });

  it('refuses to bet on a match that is no longer open', async () => {
    const user = await makeUser('2');
    const matchId = await createMatch({ gameType: 'test', mode: 'pooled' });
    await lockBalance(user.id, '1', matchId);
    await settleMatch(matchId, [user.id], [1]);

    await expect(lockBalance(user.id, '0.5', matchId)).rejects.toThrow(/already settled/i);
  });
});

describe('settleMatch — pooled', () => {
  it('takes 5% off the pot and pays the winner the rest', async () => {
    const alice = await makeUser('1');
    const bob = await makeUser('1');
    const matchId = await createMatch({ gameType: 'test', mode: 'pooled' });

    await lockBalance(alice.id, '1', matchId);
    await lockBalance(bob.id, '1', matchId);

    const res = await settleMatch(matchId, [alice.id], [1]);

    // 2 SOL pot, 5% = 0.1 SOL fee, winner takes 1.9 SOL.
    expect(res.pot.toFixed(9)).toBe(sol('2'));
    expect(res.feeCollected.toFixed(9)).toBe(sol('0.1'));
    expect(await balancesOf(alice.id)).toEqual({ available: sol('1.9'), locked: sol('0') });
    expect(await balancesOf(bob.id)).toEqual({ available: sol('0'), locked: sol('0') });
  });

  it('splits a pot between multiple winners by weight', async () => {
    const a = await makeUser('1');
    const b = await makeUser('1');
    const c = await makeUser('2');
    const matchId = await createMatch({ gameType: 'test', mode: 'pooled' });

    await lockBalance(a.id, '1', matchId);
    await lockBalance(b.id, '1', matchId);
    await lockBalance(c.id, '2', matchId);

    // 4 SOL pot - 5% = 3.8 SOL, split 3:1 between a and b.
    const res = await settleMatch(matchId, [a.id, b.id], [3, 1]);

    expect(res.feeCollected.toFixed(9)).toBe(sol('0.2'));
    expect((await balancesOf(a.id)).available).toBe(sol('2.85'));
    expect((await balancesOf(b.id)).available).toBe(sol('0.95'));
  });

  it('conserves the pot exactly: payouts + fee === pot', async () => {
    const players = await Promise.all([makeUser('1'), makeUser('1'), makeUser('1')]);
    const matchId = await createMatch({ gameType: 'test', mode: 'pooled' });

    // An awkward stake that does not divide cleanly by three.
    for (const p of players) await lockBalance(p.id, '0.333333333', matchId);

    const res = await settleMatch(matchId, players.map((p) => p.id), [1, 1, 1]);

    const paid = res.payouts.reduce((acc, p) => acc.plus(p.payout), res.feeCollected);
    expect(paid.toFixed(9)).toBe(res.pot.toFixed(9));
  });

  it('returns every stake and takes no fee when there is no winner (a draw)', async () => {
    const a = await makeUser('1');
    const b = await makeUser('1');
    const matchId = await createMatch({ gameType: 'test', mode: 'pooled' });
    await lockBalance(a.id, '1', matchId);
    await lockBalance(b.id, '1', matchId);

    const res = await settleMatch(matchId, [], []);

    expect(res.feeCollected.toFixed(9)).toBe(sol('0'));
    expect((await balancesOf(a.id)).available).toBe(sol('1'));
    expect((await balancesOf(b.id)).available).toBe(sol('1'));
  });

  it('cannot be settled twice', async () => {
    const user = await makeUser('1');
    const matchId = await createMatch({ gameType: 'test', mode: 'pooled' });
    await lockBalance(user.id, '1', matchId);
    await settleMatch(matchId, [user.id], [1]);

    await expect(settleMatch(matchId, [user.id], [1])).rejects.toThrow(/already settled/i);
    // Crucially, the second attempt paid nothing extra.
    expect((await balancesOf(user.id)).available).toBe(sol('0.95'));
  });

  it('survives concurrent settlement attempts without double-paying', async () => {
    const user = await makeUser('1');
    const matchId = await createMatch({ gameType: 'test', mode: 'pooled' });
    await lockBalance(user.id, '1', matchId);

    const results = await Promise.allSettled([
      settleMatch(matchId, [user.id], [1]),
      settleMatch(matchId, [user.id], [1]),
      settleMatch(matchId, [user.id], [1]),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await balancesOf(user.id)).available).toBe(sol('0.95'));
  });
});

describe('settleMatch — solo vs house', () => {
  it('pays the odds-table amount and charges no extra fee', async () => {
    // 1 SOL staked at 1.9x — the 5% edge is already inside that multiplier.
    const user = await makeUser('1');
    const matchId = await createMatch({ gameType: 'coin-flip', mode: 'solo_vs_house' });
    await lockBalance(user.id, '1', matchId);

    const res = await settleMatch(matchId, [user.id], ['1.9']);

    expect(res.feeCollected.toFixed(9)).toBe(sol('0')); // house paid out more than the pot
    expect(await balancesOf(user.id)).toEqual({ available: sol('1.9'), locked: sol('0') });
  });

  it('keeps the stake and records the edge when the player loses', async () => {
    const user = await makeUser('1');
    const matchId = await createMatch({ gameType: 'coin-flip', mode: 'solo_vs_house' });
    await lockBalance(user.id, '1', matchId);

    const res = await settleMatch(matchId, [], []);

    expect(res.feeCollected.toFixed(9)).toBe(sol('1'));
    expect(await balancesOf(user.id)).toEqual({ available: sol('0'), locked: sol('0') });
  });

  it('rejects sub-lamport payouts', async () => {
    const user = await makeUser('1');
    const matchId = await createMatch({ gameType: 'coin-flip', mode: 'solo_vs_house' });
    await lockBalance(user.id, '1', matchId);

    await expect(settleMatch(matchId, [user.id], ['1.0000000001'])).rejects.toThrow(
      /decimal places/i,
    );
  });
});

describe('refundMatch', () => {
  it('returns every stake in full and takes no fee', async () => {
    const a = await makeUser('2');
    const b = await makeUser('2');
    const matchId = await createMatch({ gameType: 'test', mode: 'pooled' });
    await lockBalance(a.id, '1', matchId);
    await lockBalance(b.id, '1.5', matchId);

    const res = await refundMatch(matchId, 'server crashed');

    expect(res.total.toFixed(9)).toBe(sol('2.5'));
    expect(await balancesOf(a.id)).toEqual({ available: sol('2'), locked: sol('0') });
    expect(await balancesOf(b.id)).toEqual({ available: sol('2'), locked: sol('0') });

    const match = await db().match.findUniqueOrThrow({ where: { id: matchId } });
    expect(toAmountString(match.feeCollected)).toBe(sol('0'));
    expect(match.status).toBe('refunded');
  });

  it('unwinds totalWagered so a crash does not inflate lifetime volume', async () => {
    const user = await makeUser('2');
    const matchId = await createMatch({ gameType: 'test', mode: 'pooled' });
    await lockBalance(user.id, '1', matchId);
    expect(
      toAmountString((await db().user.findUniqueOrThrow({ where: { id: user.id } })).totalWagered),
    ).toBe(sol('1'));

    await refundMatch(matchId);
    expect(
      toAmountString((await db().user.findUniqueOrThrow({ where: { id: user.id } })).totalWagered),
    ).toBe(sol('0'));
  });

  it('cannot refund a settled match', async () => {
    const user = await makeUser('1');
    const matchId = await createMatch({ gameType: 'test', mode: 'pooled' });
    await lockBalance(user.id, '1', matchId);
    await settleMatch(matchId, [user.id], [1]);

    await expect(refundMatch(matchId)).rejects.toThrow(/already settled/i);
  });
});

describe('forfeitPlayer — 15-second grace period', () => {
  it('forfeits the stake when the player does not reconnect', async () => {
    const quitter = await makeUser('1');
    const stayer = await makeUser('1');
    const matchId = await createMatch({ gameType: 'test', mode: 'pooled' });
    await lockBalance(quitter.id, '1', matchId);
    await lockBalance(stayer.id, '1', matchId);

    // 20ms stands in for the real 15s window.
    const res = await forfeitPlayer(matchId, quitter.id, 20);

    expect(res.outcome).toBe('forfeited');
    expect(res.forfeitedAmount.toFixed(9)).toBe(sol('1'));
    // Their stake is gone from locked, and NOT returned to available.
    expect(await balancesOf(quitter.id)).toEqual({ available: sol('0'), locked: sol('0') });
  });

  it('leaves the forfeited stake in the pot for the remaining player', async () => {
    const quitter = await makeUser('1');
    const stayer = await makeUser('1');
    const matchId = await createMatch({ gameType: 'test', mode: 'pooled' });
    await lockBalance(quitter.id, '1', matchId);
    await lockBalance(stayer.id, '1', matchId);

    await forfeitPlayer(matchId, quitter.id, 20);
    const res = await settleMatch(matchId, [stayer.id], [1]);

    // The winner plays for the full 2 SOL pot, minus the 5% fee.
    expect(res.pot.toFixed(9)).toBe(sol('2'));
    expect((await balancesOf(stayer.id)).available).toBe(sol('1.9'));
    // And the quitter was never debited twice.
    expect((await balancesOf(quitter.id)).locked).toBe(sol('0'));
  });

  it('cancels the forfeit when the player reconnects in time', async () => {
    const user = await makeUser('1');
    const matchId = await createMatch({ gameType: 'test', mode: 'pooled' });
    await lockBalance(user.id, '1', matchId);

    const pending = forfeitPlayer(matchId, user.id, 300);
    await new Promise((r) => setTimeout(r, 30));
    const cancelled = await cancelForfeit(matchId, user.id);

    expect(cancelled).toBe(true);
    expect((await pending).outcome).toBe('reconnected');
    // Stake untouched.
    expect(await balancesOf(user.id)).toEqual({ available: sol('0'), locked: sol('1') });
  });

  it('refunds a forfeited stake too when the match is later refunded', async () => {
    const user = await makeUser('1');
    const matchId = await createMatch({ gameType: 'test', mode: 'pooled' });
    await lockBalance(user.id, '1', matchId);
    await forfeitPlayer(matchId, user.id, 20);

    await refundMatch(matchId, 'crash after a forfeit');

    expect(await balancesOf(user.id)).toEqual({ available: sol('1'), locked: sol('0') });
  });

  it('does nothing when the match already resolved', async () => {
    const user = await makeUser('1');
    const matchId = await createMatch({ gameType: 'test', mode: 'pooled' });
    await lockBalance(user.id, '1', matchId);
    await settleMatch(matchId, [user.id], [1]);

    const res = await forfeitPlayer(matchId, user.id, 20);
    expect(res.outcome).toBe('already-resolved');
  });
});

describe('audit trail and database guarantees', () => {
  it('writes a ledger entry for every money movement', async () => {
    const a = await makeUser('1');
    const b = await makeUser('1');
    const matchId = await createMatch({ gameType: 'test', mode: 'pooled' });

    await lockBalance(a.id, '1', matchId);
    await lockBalance(b.id, '1', matchId);
    await settleMatch(matchId, [a.id], [1]);

    const types = (await db().ledgerEntry.findMany({ where: { matchId } })).map((e) => e.type);
    expect(types.filter((t) => t === 'lock')).toHaveLength(2);
    expect(types.filter((t) => t === 'settlement')).toHaveLength(2);
    expect(types.filter((t) => t === 'fee')).toHaveLength(1);
  });

  it('the DATABASE itself rejects a negative balance', async () => {
    // The CHECK constraint is the backstop under all the application logic:
    // even a direct write cannot corrupt a balance.
    const user = await makeUser('1');
    await expect(
      db().user.update({ where: { id: user.id }, data: { availableBalance: '-0.000000001' } }),
    ).rejects.toThrow();
  });

  it('the DATABASE rejects a fee larger than the pot', async () => {
    const matchId = await createMatch({ gameType: 'test', mode: 'pooled' });
    await expect(
      db().match.update({ where: { id: matchId }, data: { feeCollected: '1', pot: '0.5' } }),
    ).rejects.toThrow();
  });

  it('allows many off-chain ledger rows but only one row per tx signature', async () => {
    const user = await makeUser('1');
    // Off-chain rows carry no signature — Postgres treats NULLs as distinct.
    for (let i = 0; i < 3; i += 1) {
      await db().ledgerEntry.create({
        data: { userId: user.id, type: 'lock', status: 'confirmed', amount: '-0.1' },
      });
    }
    expect(await db().ledgerEntry.count()).toBe(3);

    // But a real signature can only ever appear once — the double-credit guard.
    await db().ledgerEntry.create({
      data: { userId: user.id, type: 'deposit', status: 'confirmed', amount: '1', txSignature: 'sig-a' },
    });
    await expect(
      db().ledgerEntry.create({
        data: { userId: user.id, type: 'deposit', status: 'confirmed', amount: '1', txSignature: 'sig-a' },
      }),
    ).rejects.toThrow();
  });

  it('never lets a balance go negative across a full match lifecycle', async () => {
    const users = await Promise.all([makeUser('3'), makeUser('3'), makeUser('3')]);

    for (let round = 0; round < 5; round += 1) {
      const matchId = await createMatch({ gameType: 'test', mode: 'pooled' });
      for (const u of users) {
        await lockBalance(u.id, '0.5', matchId).catch(() => undefined);
      }
      await settleMatch(matchId, [users[round % 3]!.id], [1]).catch(() => undefined);
    }

    for (const u of users) {
      const { available, locked } = await balancesOf(u.id);
      expect(Number(available)).toBeGreaterThanOrEqual(0);
      expect(Number(locked)).toBeGreaterThanOrEqual(0);
    }
  });
});
