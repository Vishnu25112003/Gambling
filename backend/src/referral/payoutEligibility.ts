import { prisma } from '../config/db.js';
import { env } from '../config/env.js';
import { Decimal, toDecimal, toAmountString, type MoneyInput } from '../lib/money.js';
import type { Prisma } from '../generated/prisma/client.js';

/**
 * ===========================================================================
 * Doc 09 — the anti-Sybil gate on a referral PAYOUT.
 * ===========================================================================
 *
 * THE ATTACK: one person, two wallets. Wallet A invites wallet B, B plays until
 * it happens to profit, and A collects 5% of that profit from the house. The
 * `referrals.referredUserId` unique index and the `no_self_referral` CHECK stop
 * the trivial version — one referrer per account, and never yourself — but
 * neither can tell two wallets apart, because on-chain nothing distinguishes
 * them. Doc 09 shipped with this listed as its first open question.
 *
 * WHY A THRESHOLD RATHER THAN DETECTION: identity heuristics (funding-source
 * clustering, IP, timing) are guesses, and a wrong guess here silently refuses
 * money to an honest player who will never be told why. A threshold is a rule
 * that can be stated up front, applies identically to everyone, and is checked
 * against facts already in the ledger. It does not try to prove who someone is;
 * it makes the farm unprofitable whoever runs it.
 *
 * WHY THESE TWO SIGNALS TOGETHER:
 *
 *   Wagering is the one that bites. Every pooled wager pays the platform 5% of
 *   the pot ([[03-Escrow]]). Requiring the invited player to have wagered a
 *   minimum means the house has already collected rake on that turnover before
 *   it pays any commission out, so the loop costs the farmer more than it
 *   returns. That is what makes this economics rather than a speed bump.
 *
 *   Deposits close the hole wagering alone leaves. Turnover can be manufactured
 *   from balance that never came from outside the system — a promo credit, or a
 *   commission earned by an earlier ring member. Requiring real SOL to have
 *   arrived on-chain means every new mouth in a Sybil ring costs its operator
 *   actual funds and actual network fees.
 *
 * WHY IT GATES THE PAYOUT AND NOT THE BINDING: attribution stays generous and
 * instant — a new player is bound to their inviter the moment they sign in, and
 * both sides see it immediately. Only the money waits. Gating the bind instead
 * would mean an honest referral silently failing to register at sign-in, which
 * is both worse UX and unrecoverable, since the eligibility window closes at
 * their first game.
 *
 * A referral that fails this check stays `pending` — never voided. The invited
 * player deposits, plays, and the next win pays out normally. Nothing expires.
 * ===========================================================================
 */

/** Prisma client, or the transaction-scoped one from inside `$transaction`. */
type Db = Prisma.TransactionClient | typeof prisma;

export type RequirementKey = 'deposit' | 'wagered';

export interface Requirement {
  key: RequirementKey;
  /** Exact SOL decimal string. */
  required: string;
  /** Exact SOL decimal string — what this player has actually done. */
  actual: string;
  met: boolean;
}

export interface PayoutEligibility {
  /** True only when every requirement is met. */
  eligible: boolean;
  requirements: Requirement[];
}

/** The configured thresholds, as exact Decimals. */
export function payoutThresholds(): { minDeposit: Decimal; minWagered: Decimal } {
  return {
    minDeposit: toDecimal(env.REFERRAL_MIN_DEPOSIT_SOL),
    minWagered: toDecimal(env.REFERRAL_MIN_WAGERED_SOL),
  };
}

/**
 * Total confirmed on-chain SOL this player has deposited.
 *
 * `confirmed` only: a pending deposit is one the chain has not agreed on yet,
 * and a failed one never arrived. Withdrawals are deliberately NOT subtracted —
 * the question is "did real money ever enter", which withdrawing later does not
 * undo. Netting them would also hand an attacker a trivial dodge in reverse:
 * deposit, qualify, withdraw, and the record of having qualified disappears.
 */
async function depositedTotal(db: Db, userId: string): Promise<Decimal> {
  const agg = await db.ledgerEntry.aggregate({
    where: { userId, type: 'deposit', status: 'confirmed' },
    _sum: { amount: true },
  });
  return toDecimal((agg._sum.amount ?? 0) as MoneyInput);
}

function requirement(key: RequirementKey, required: Decimal, actual: Decimal): Requirement {
  return {
    key,
    required: toAmountString(required),
    actual: toAmountString(actual),
    // `>=`, so a threshold of exactly 0 is met by everyone and that half of the
    // gate is simply off — the documented way to disable it per environment.
    met: actual.greaterThanOrEqualTo(required),
  };
}

/**
 * May the commission on this player's win actually be paid?
 *
 * Reads only committed facts — deposit ledger rows and `users.totalWagered` —
 * so it is safe to call inside the settlement transaction. `totalWagered` is
 * incremented by `lockBalance` when a stake is locked, not at settlement, so
 * the stake of the very match being settled is ALREADY counted here. A player
 * whose first match takes them over the line qualifies on that same match
 * rather than the one after it.
 */
export async function checkPayoutEligibility(db: Db, userId: string): Promise<PayoutEligibility> {
  const { minDeposit, minWagered } = payoutThresholds();

  // Skip the aggregate entirely when the deposit half is switched off.
  const [deposited, user] = await Promise.all([
    minDeposit.greaterThan(0) ? depositedTotal(db, userId) : Promise.resolve(new Decimal(0)),
    db.user.findUnique({ where: { id: userId }, select: { totalWagered: true } }),
  ]);

  const wagered = toDecimal((user?.totalWagered ?? 0) as MoneyInput);

  const requirements = [
    requirement('deposit', minDeposit, deposited),
    requirement('wagered', minWagered, wagered),
  ];

  return { eligible: requirements.every((r) => r.met), requirements };
}

/**
 * The same question for a batch of players, in one pair of queries.
 *
 * `GET /referrals/me` needs this for every pending friend at once, and calling
 * `checkPayoutEligibility` in a loop would be two queries per invited friend.
 * Returns a Set of the userIds that qualify.
 */
export async function qualifiedUserIds(
  db: Db,
  users: { id: string; totalWagered: MoneyInput }[],
): Promise<Set<string>> {
  const qualified = new Set<string>();
  if (users.length === 0) return qualified;

  const { minDeposit, minWagered } = payoutThresholds();

  const deposits = new Map<string, Decimal>();
  if (minDeposit.greaterThan(0)) {
    const rows = await db.ledgerEntry.groupBy({
      by: ['userId'],
      where: { userId: { in: users.map((u) => u.id) }, type: 'deposit', status: 'confirmed' },
      _sum: { amount: true },
    });
    for (const row of rows) {
      if (row.userId) deposits.set(row.userId, toDecimal((row._sum.amount ?? 0) as MoneyInput));
    }
  }

  for (const user of users) {
    const deposited = deposits.get(user.id) ?? new Decimal(0);
    const wagered = toDecimal(user.totalWagered);
    if (deposited.greaterThanOrEqualTo(minDeposit) && wagered.greaterThanOrEqualTo(minWagered)) {
      qualified.add(user.id);
    }
  }

  return qualified;
}
