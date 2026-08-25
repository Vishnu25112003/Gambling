import { Decimal, applyFeeBps, toDecimal, type MoneyInput } from '../lib/money.js';
import { createLogger } from '../lib/logger.js';
import { shortAddress } from '../lib/user.js';
import type { LedgerEntryLike } from '../lib/ledgerRow.js';
import type { Prisma } from '../generated/prisma/client.js';

const log = createLogger('referral:award');

/**
 * The subset of the Prisma client available inside a `$transaction` callback.
 * Taking this rather than the global `prisma` is what makes the commission
 * atomic with the settlement that triggered it.
 */
type Tx = Prisma.TransactionClient;

export interface AwardInput {
  /** The player who just settled a match — the REFERRED side, not the referrer. */
  userId: string;
  /** Their net profit on it: payout − total stake. Zero or negative means no commission. */
  netWin: MoneyInput;
  matchId: string;
  gameType: string;
}

export interface AwardResult {
  referrerId: string;
  commission: Decimal;
  /** The ledger row just created, so the caller's transaction can push it live once it commits. */
  ledgerEntry: LedgerEntryLike;
}

/**
 * ===========================================================================
 * Doc 09 — pay the referrer, once, on their friend's first winning match.
 * ===========================================================================
 *
 * Called from `settleMatch` for every participant, inside the settlement's own
 * transaction. Almost every call returns immediately: a player with no referrer,
 * or one who did not profit, does no database work at all beyond a single
 * conditional UPDATE that matches nothing.
 *
 * WHY "FIRST WIN" AND NOT "FIRST GAME": a referral that resolves on the literal
 * first match pays nothing whenever the friend loses, which is most of the time,
 * so the referrer's reward turns on a coin flip they had no part in. Holding the
 * referral `pending` until the friend first profits costs the house the same 5%
 * and makes every referral eventually worth something. It is also less code —
 * there is no need to know which match was the first, only whether this one
 * profited.
 *
 * WHERE THE MONEY COMES FROM: the house. The pot is untouched, the referred
 * player's payout is untouched, and `match.feeCollected` is left exactly as
 * settlement computed it. That fee row still means "what the platform took off
 * the pot", which stays literally true; net revenue is `sum(fee) − sum(referral)`
 * and both halves are in the ledger. Deliberately NOT deducted from
 * `feeCollected`, because that column sits under a `CHECK (feeCollected <= pot)`
 * constraint that exists to protect player funds — marketing policy does not
 * belong inside it.
 *
 * On a `solo_vs_house` win larger than the pot, `feeCollected` is already zero
 * and the commission comes straight out of treasury float. That is what
 * house-funded means, and it is bounded: one payout per referred player, ever.
 * ===========================================================================
 */
export async function awardReferralOnWin(
  tx: Tx,
  { userId, netWin, matchId, gameType }: AwardInput,
): Promise<AwardResult | null> {
  const profit = toDecimal(netWin);
  // The overwhelmingly common path — a loss, a draw, or a player nobody
  // referred — costs one comparison and no query.
  if (profit.lessThanOrEqualTo(0)) return null;

  const referral = await tx.referral.findUnique({
    where: { referredUserId: userId },
    select: { id: true, referrerId: true, commissionBps: true, status: true },
  });
  if (!referral || referral.status !== 'pending') return null;

  // Basis points snapshotted at bind time, not read from config, so a rate
  // change never re-prices a referral that was already promised.
  const { fee: commission } = applyFeeBps(profit, referral.commissionBps);
  if (commission.lessThanOrEqualTo(0)) {
    // A win so small that 5% of it truncates to zero lamports. Paying nothing
    // and burning the referral would be the worst of both worlds, so leave it
    // pending for a bigger win.
    return null;
  }

  /**
   * Claim the referral atomically.
   *
   * The same conditional-UPDATE idiom the rest of this codebase uses for
   * exactly-once (`settleMatch`'s match claim, `lockBalance`'s balance debit,
   * `consumeChallenge`'s nonce). `WHERE status = 'pending'` means a second
   * concurrent settlement matches zero rows and pays nothing. The outer match
   * claim already makes double-settlement impossible; this holds independently
   * of it, so the guarantee does not depend on a caller getting it right.
   */
  const claimed = await tx.$executeRaw`
    UPDATE referrals
       SET status = 'earned',
           "earnedAmount" = ${commission.toFixed(9)}::numeric,
           "matchId" = ${matchId}::uuid,
           "gameType" = ${gameType},
           "earnedAt" = NOW()
     WHERE id = ${referral.id}::uuid AND status = 'pending'
  `;
  if (claimed === 0) return null;

  const referrer = await tx.user.update({
    where: { id: referral.referrerId },
    data: { availableBalance: { increment: commission } },
  });

  const referred = await tx.user.findUniqueOrThrow({
    where: { id: userId },
    select: { walletAddress: true, username: true },
  });
  const friend = referred.username ?? shortAddress(referred.walletAddress);

  const ledgerEntry = await tx.ledgerEntry.create({
    data: {
      userId: referral.referrerId,
      type: 'referral',
      status: 'confirmed',
      amount: commission,
      // Populated so a dispute is reconstructible from the ledger alone, which
      // the schema asks of every entry.
      balanceAfterAvailable: referrer.availableBalance,
      balanceAfterLocked: referrer.lockedBalance,
      matchId,
      gameType,
      note: `Referral bonus: ${referral.commissionBps / 100}% of ${friend}'s first win`,
      meta: {
        referredUserId: userId,
        netWin: profit.toFixed(9),
        commissionBps: referral.commissionBps,
      },
    },
  });

  log.info('referral commission paid', {
    referrerId: referral.referrerId,
    referredUserId: userId,
    matchId,
    netWin: profit.toFixed(9),
    commission: commission.toFixed(9),
  });

  return { referrerId: referral.referrerId, commission, ledgerEntry };
}
