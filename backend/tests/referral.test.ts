import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { lockBalance } from '../src/escrow/lockBalance.js';
import { settleMatch } from '../src/escrow/settleMatch.js';
import { refundMatch } from '../src/escrow/refundMatch.js';
import { createMatch } from '../src/escrow/index.js';
import { bindReferral } from '../src/referral/bindReferral.js';
import {
  checkPayoutEligibility,
  qualifiedUserIds,
} from '../src/referral/payoutEligibility.js';
import { env } from '../src/config/env.js';
import { ensureReferralCode, generateCode } from '../src/referral/referralCode.js';
import { toAmountString } from '../src/lib/money.js';
import { startTestDb, stopTestDb, clearTables, getTestPrisma } from './setup.js';

/**
 * Doc 09 — Invite & Earn.
 *
 * Same discipline as escrow.test.ts: a real PostgreSQL with the real migrations,
 * because the guarantees under test are database guarantees — the unique index
 * that makes attribution permanent, the CHECK that blocks self-referral, and the
 * conditional UPDATE that pays exactly once.
 */

const db = () => getTestPrisma();

let userSeq = 0;
async function makeUser(available = '0') {
  userSeq += 1;
  return db().user.create({
    data: {
      walletAddress: `wallet-${userSeq}-${Math.random().toString(36).slice(2, 8)}`,
      availableBalance: available,
      referralCode: generateCode(),
    },
  });
}

const sol = (v: string) => toAmountString(v);

async function availableOf(id: string): Promise<string> {
  const u = await db().user.findUniqueOrThrow({ where: { id } });
  return toAmountString(u.availableBalance);
}

/** Play one pooled match head-to-head and let `winner` take it. */
async function playPooled(
  a: { id: string },
  b: { id: string },
  stake: string,
  winner: { id: string } | null,
) {
  const matchId = await createMatch({ gameType: 'test', mode: 'pooled' });
  await lockBalance(a.id, stake, matchId);
  await lockBalance(b.id, stake, matchId);
  await settleMatch(matchId, winner ? [winner.id] : [], winner ? [1] : []);
  return matchId;
}

beforeAll(startTestDb, 180_000);
afterAll(stopTestDb);
beforeEach(clearTables);

/**
 * The anti-Sybil payout gate is OFF for every test above its own describe block.
 *
 * `payoutThresholds()` reads these at call time, so setting them to 0 turns both
 * halves off (the documented per-environment kill switch) and leaves every test
 * of the commission rules testing exactly what it says it does — a stake of 10
 * lamports would otherwise be stopped by the wagering gate long before it
 * reached the truncates-to-zero-lamports branch it exists to cover.
 *
 * The gate's own suite sets real thresholds in a nested hook, which runs after
 * this one.
 */
beforeEach(() => {
  env.REFERRAL_MIN_DEPOSIT_SOL = 0;
  env.REFERRAL_MIN_WAGERED_SOL = 0;
});

/** A confirmed on-chain deposit, the only kind the gate counts. */
let depositSeq = 0;
async function deposit(
  userId: string,
  amount: string,
  status: 'confirmed' | 'pending' | 'failed' = 'confirmed',
) {
  depositSeq += 1;
  return db().ledgerEntry.create({
    data: {
      userId,
      type: 'deposit',
      status,
      amount,
      txSignature: `depsig-${depositSeq}-${Math.random().toString(36).slice(2, 10)}`,
    },
  });
}

describe('referral codes', () => {
  it('mints a code that is unambiguous to read aloud', () => {
    const code = generateCode();
    expect(code).toHaveLength(8);
    // Crockford base32 — no I, L, O or U, so nothing reads as 1/0 or worse.
    expect(code).toMatch(/^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{8}$/);
  });

  it('mints lazily for accounts that predate the column, then stays stable', async () => {
    const user = await db().user.create({ data: { walletAddress: `legacy-${Date.now()}` } });
    expect(user.referralCode).toBeNull();

    const first = await ensureReferralCode(user.id);
    const second = await ensureReferralCode(user.id);

    expect(first).toMatch(/^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{8}$/);
    expect(second).toBe(first);
  });
});

describe('bindReferral', () => {
  it('binds a new player to the referrer whose code they used', async () => {
    const alice = await makeUser();
    const bob = await makeUser();

    const result = await bindReferral(bob.id, alice.referralCode!);

    expect(result.referrerId).toBe(alice.id);
    expect(result.commissionBps).toBe(500);

    const row = await db().referral.findUniqueOrThrow({ where: { referredUserId: bob.id } });
    expect(row.referrerId).toBe(alice.id);
    expect(row.status).toBe('pending');
  });

  it('accepts a code in the wrong case or with stray whitespace', async () => {
    const alice = await makeUser();
    const bob = await makeUser();

    await bindReferral(bob.id, `  ${alice.referralCode!.toLowerCase()} `);

    const row = await db().referral.findUniqueOrThrow({ where: { referredUserId: bob.id } });
    expect(row.referrerId).toBe(alice.id);
  });

  it('rejects an unknown code', async () => {
    const bob = await makeUser();
    await expect(bindReferral(bob.id, 'ZZZZZZZZ')).rejects.toThrow(/does not exist/i);
  });

  it('rejects self-referral', async () => {
    const alice = await makeUser();
    await expect(bindReferral(alice.id, alice.referralCode!)).rejects.toThrow(/yourself/i);
  });

  it('blocks self-referral in the database even if application logic is bypassed', async () => {
    const alice = await makeUser();
    await expect(
      db().referral.create({ data: { referrerId: alice.id, referredUserId: alice.id } }),
    ).rejects.toThrow();
  });

  it('refuses a second referrer — attribution is permanent', async () => {
    const alice = await makeUser();
    const carol = await makeUser();
    const bob = await makeUser();

    await bindReferral(bob.id, alice.referralCode!);
    await expect(bindReferral(bob.id, carol.referralCode!)).rejects.toThrow(/already joined/i);

    const row = await db().referral.findUniqueOrThrow({ where: { referredUserId: bob.id } });
    expect(row.referrerId).toBe(alice.id);
  });

  it('refuses a code once the player has already played', async () => {
    const alice = await makeUser();
    const bob = await makeUser('1');
    const carol = await makeUser('1');

    await playPooled(bob, carol, '0.5', carol);

    await expect(bindReferral(bob.id, alice.referralCode!)).rejects.toThrow(/before your first game/i);
  });
});

describe('commission on the referred player’s first win', () => {
  it('pays nothing while the friend keeps losing, and leaves the referral pending', async () => {
    const alice = await makeUser();
    const bob = await makeUser('2');
    const carol = await makeUser('2');
    await bindReferral(bob.id, alice.referralCode!);

    await playPooled(bob, carol, '1', carol); // bob loses

    expect(await availableOf(alice.id)).toBe(sol('0'));
    const row = await db().referral.findUniqueOrThrow({ where: { referredUserId: bob.id } });
    expect(row.status).toBe('pending');
  });

  it('pays 5% of the friend’s net profit the first time they win', async () => {
    const alice = await makeUser();
    const bob = await makeUser('2');
    const carol = await makeUser('2');
    await bindReferral(bob.id, alice.referralCode!);

    // Pot 2, 5% platform fee = 0.1, bob takes 1.9. Net profit = 1.9 - 1 = 0.9.
    // Alice earns 5% of 0.9 = 0.045.
    await playPooled(bob, carol, '1', bob);

    expect(await availableOf(alice.id)).toBe(sol('0.045'));

    const row = await db().referral.findUniqueOrThrow({ where: { referredUserId: bob.id } });
    expect(row.status).toBe('earned');
    expect(toAmountString(row.earnedAmount)).toBe(sol('0.045'));
    expect(row.earnedAt).not.toBeNull();
    expect(row.matchId).not.toBeNull();
  });

  it('writes an auditable referral ledger entry', async () => {
    const alice = await makeUser();
    const bob = await makeUser('2');
    const carol = await makeUser('2');
    await bindReferral(bob.id, alice.referralCode!);

    await playPooled(bob, carol, '1', bob);

    const entry = await db().ledgerEntry.findFirstOrThrow({
      where: { userId: alice.id, type: 'referral' },
    });
    expect(entry.status).toBe('confirmed');
    expect(toAmountString(entry.amount)).toBe(sol('0.045'));
    // Reconstructible from the ledger alone, as the schema requires.
    expect(toAmountString(entry.balanceAfterAvailable!)).toBe(sol('0.045'));
    expect(entry.matchId).not.toBeNull();
    expect(entry.meta).toMatchObject({ referredUserId: bob.id, commissionBps: 500 });
  });

  it('pays exactly once, no matter how often the friend wins afterwards', async () => {
    const alice = await makeUser();
    const bob = await makeUser('5');
    const carol = await makeUser('5');
    await bindReferral(bob.id, alice.referralCode!);

    await playPooled(bob, carol, '1', bob);
    const afterFirst = await availableOf(alice.id);

    await playPooled(bob, carol, '1', bob);
    await playPooled(bob, carol, '1', bob);

    expect(await availableOf(alice.id)).toBe(afterFirst);
    expect(await db().ledgerEntry.count({ where: { userId: alice.id, type: 'referral' } })).toBe(1);
  });

  it('treats a draw as no win — nothing paid, referral still pending', async () => {
    const alice = await makeUser();
    const bob = await makeUser('2');
    const carol = await makeUser('2');
    await bindReferral(bob.id, alice.referralCode!);

    // No winner declared: stakes come back, no fee, so net profit is exactly 0.
    await playPooled(bob, carol, '1', null);

    expect(await availableOf(alice.id)).toBe(sol('0'));
    const row = await db().referral.findUniqueOrThrow({ where: { referredUserId: bob.id } });
    expect(row.status).toBe('pending');
  });

  it('pays from treasury float on a solo-vs-house win, where no fee was collected', async () => {
    const alice = await makeUser();
    const bob = await makeUser('2');
    await bindReferral(bob.id, alice.referralCode!);

    const matchId = await createMatch({ gameType: 'test', mode: 'solo_vs_house' });
    await lockBalance(bob.id, '1', matchId);
    // 1 SOL staked at 1.9x — the house edge is in the odds, so feeCollected is 0
    // and the whole commission comes out of float. Net profit = 0.9.
    await settleMatch(matchId, [bob.id], ['1.9']);

    const match = await db().match.findUniqueOrThrow({ where: { id: matchId } });
    expect(toAmountString(match.feeCollected)).toBe(sol('0'));
    expect(await availableOf(alice.id)).toBe(sol('0.045'));
  });

  it('pays nothing on a refunded match', async () => {
    const alice = await makeUser();
    const bob = await makeUser('2');
    await bindReferral(bob.id, alice.referralCode!);

    const matchId = await createMatch({ gameType: 'test', mode: 'pooled' });
    await lockBalance(bob.id, '1', matchId);
    await refundMatch(matchId, 'server restarted');

    expect(await availableOf(alice.id)).toBe(sol('0'));
    const row = await db().referral.findUniqueOrThrow({ where: { referredUserId: bob.id } });
    expect(row.status).toBe('pending');
  });

  it('leaves the referral pending when 5% of a win truncates to zero lamports', async () => {
    const alice = await makeUser();
    const bob = await makeUser('1');
    const carol = await makeUser('1');
    await bindReferral(bob.id, alice.referralCode!);

    // Stakes of 10 lamports: pot 20, fee truncates to 0, bob takes 20 for a net
    // profit of 10 lamports. 5% of that truncates to 0 — paying nothing AND
    // burning the referral would be the worst of both worlds.
    await playPooled(bob, carol, '0.00000001', bob);

    expect(await availableOf(alice.id)).toBe(sol('0'));
    const row = await db().referral.findUniqueOrThrow({ where: { referredUserId: bob.id } });
    expect(row.status).toBe('pending');
  });

  it('does not disturb the settlement itself — pot conservation still holds', async () => {
    const alice = await makeUser();
    const bob = await makeUser('2');
    const carol = await makeUser('2');
    await bindReferral(bob.id, alice.referralCode!);

    const matchId = await playPooled(bob, carol, '1', bob);

    const match = await db().match.findUniqueOrThrow({ where: { id: matchId } });
    // The commission is house-funded: the pot, the fee and the winner's payout
    // are all exactly what they would have been with no referral in play.
    expect(toAmountString(match.pot)).toBe(sol('2'));
    expect(toAmountString(match.feeCollected)).toBe(sol('0.1'));
    expect(await availableOf(bob.id)).toBe(sol('2.9')); // 1 left over + 1.9 payout
    expect(await availableOf(carol.id)).toBe(sol('1'));
  });

  it('pays nothing to a player nobody referred', async () => {
    const bob = await makeUser('2');
    const carol = await makeUser('2');

    await playPooled(bob, carol, '1', bob);

    expect(await db().ledgerEntry.count({ where: { type: 'referral' } })).toBe(0);
  });
});

/**
 * Doc 09's first open question, closed: a referral only PAYS once the invited
 * player has put real money at risk. Attribution is untouched — binding stays
 * instant, and a referral that fails the gate stays `pending` rather than being
 * voided, so an honest slow starter loses nothing.
 */
describe('anti-Sybil payout gate', () => {
  beforeEach(() => {
    env.REFERRAL_MIN_DEPOSIT_SOL = 0.05;
    env.REFERRAL_MIN_WAGERED_SOL = 0.1;
  });

  it('withholds the commission from a friend who never deposited', async () => {
    const alice = await makeUser();
    const bob = await makeUser('2'); // balance, but no deposit ever arrived
    const carol = await makeUser('2');
    await bindReferral(bob.id, alice.referralCode!);

    await playPooled(bob, carol, '1', bob); // a genuine win

    expect(await availableOf(alice.id)).toBe(sol('0'));
    const row = await db().referral.findUniqueOrThrow({ where: { referredUserId: bob.id } });
    // Withheld, NOT voided — this is the whole point.
    expect(row.status).toBe('pending');
  });

  it('pays on a later win once the friend finally qualifies', async () => {
    const alice = await makeUser();
    const bob = await makeUser('2');
    const carol = await makeUser('2');
    await bindReferral(bob.id, alice.referralCode!);

    await playPooled(bob, carol, '1', bob);
    expect(await availableOf(alice.id)).toBe(sol('0'));

    await deposit(bob.id, '0.05');
    await playPooled(bob, carol, '1', bob);

    expect(await availableOf(alice.id)).toBe(sol('0.045'));
    const row = await db().referral.findUniqueOrThrow({ where: { referredUserId: bob.id } });
    expect(row.status).toBe('earned');
    expect(await db().ledgerEntry.count({ where: { userId: alice.id, type: 'referral' } })).toBe(1);
  });

  it('ignores deposits that are not confirmed', async () => {
    const alice = await makeUser();
    const bob = await makeUser('2');
    const carol = await makeUser('2');
    await bindReferral(bob.id, alice.referralCode!);
    // The chain has not agreed on this one yet, and this one never arrived.
    await deposit(bob.id, '5', 'pending');
    await deposit(bob.id, '5', 'failed');

    await playPooled(bob, carol, '1', bob);

    expect(await availableOf(alice.id)).toBe(sol('0'));
  });

  it('withholds when the deposit cleared but the wagering has not', async () => {
    const alice = await makeUser();
    const bob = await makeUser('2');
    const carol = await makeUser('2');
    await deposit(bob.id, '1');
    await bindReferral(bob.id, alice.referralCode!);

    // Stakes 0.01 total — under the 0.1 wagering floor.
    await playPooled(bob, carol, '0.01', bob);

    expect(await availableOf(alice.id)).toBe(sol('0'));
    const eligibility = await checkPayoutEligibility(db(), bob.id);
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.requirements.filter((r) => !r.met).map((r) => r.key)).toEqual(['wagered']);
  });

  it('counts the stake of the very match being settled', async () => {
    env.REFERRAL_MIN_DEPOSIT_SOL = 0;
    env.REFERRAL_MIN_WAGERED_SOL = 1;

    const alice = await makeUser();
    const bob = await makeUser('2');
    const carol = await makeUser('2');
    await bindReferral(bob.id, alice.referralCode!);

    // `lockBalance` increments totalWagered when the stake is locked, not at
    // settlement, so this 1 SOL stake already counts and bob qualifies on his
    // first match rather than the one after it.
    await playPooled(bob, carol, '1', bob);

    expect(await availableOf(alice.id)).toBe(sol('0.045'));
  });

  it('treats a threshold of zero as that half switched off', async () => {
    env.REFERRAL_MIN_DEPOSIT_SOL = 0;
    env.REFERRAL_MIN_WAGERED_SOL = 0;

    const alice = await makeUser();
    const bob = await makeUser('2');
    const carol = await makeUser('2');
    await bindReferral(bob.id, alice.referralCode!);

    await playPooled(bob, carol, '1', bob); // no deposits at all

    expect(await availableOf(alice.id)).toBe(sol('0.045'));
  });

  it('reports both requirements with exact amounts', async () => {
    const bob = await makeUser('2');
    await deposit(bob.id, '0.02');

    const { eligible, requirements } = await checkPayoutEligibility(db(), bob.id);

    expect(eligible).toBe(false);
    expect(requirements).toEqual([
      { key: 'deposit', required: sol('0.05'), actual: sol('0.02'), met: false },
      { key: 'wagered', required: sol('0.1'), actual: sol('0'), met: false },
    ]);
  });

  it('sums multiple deposits toward the threshold', async () => {
    const bob = await makeUser('2');
    await deposit(bob.id, '0.02');
    await deposit(bob.id, '0.04');

    const { requirements } = await checkPayoutEligibility(db(), bob.id);
    const depositReq = requirements.find((r) => r.key === 'deposit')!;
    expect(depositReq.actual).toBe(sol('0.06'));
    expect(depositReq.met).toBe(true);
  });

  it('answers the same question for a batch in one pass', async () => {
    const qualifies = await makeUser('2');
    const noDeposit = await makeUser('2');
    const noWager = await makeUser('2');

    await deposit(qualifies.id, '1');
    await deposit(noWager.id, '1');

    const result = await qualifiedUserIds(db(), [
      { id: qualifies.id, totalWagered: '5' },
      { id: noDeposit.id, totalWagered: '5' },
      { id: noWager.id, totalWagered: '0.01' },
    ]);

    expect(result.has(qualifies.id)).toBe(true);
    expect(result.has(noDeposit.id)).toBe(false);
    expect(result.has(noWager.id)).toBe(false);
  });

  it('does not touch the settlement it withheld a commission on', async () => {
    const alice = await makeUser();
    const bob = await makeUser('2');
    const carol = await makeUser('2');
    await bindReferral(bob.id, alice.referralCode!);

    const matchId = await playPooled(bob, carol, '1', bob);

    const match = await db().match.findUniqueOrThrow({ where: { id: matchId } });
    expect(toAmountString(match.pot)).toBe(sol('2'));
    expect(toAmountString(match.feeCollected)).toBe(sol('0.1'));
    expect(await availableOf(bob.id)).toBe(sol('2.9'));
    expect(await availableOf(carol.id)).toBe(sol('1'));
  });
});
