import { Decimal, fromLamports, toDecimal, toLamports, type MoneyInput } from '../lib/money.js';
import type { Prisma } from '../generated/prisma/client.js';
import { RAKEBACK_TIERS } from './constants.js';

type Tx = Prisma.TransactionClient;

/** The rakeback rate (basis points of the fee) for a given lifetime wager; 0 below the first tier. */
export function rakebackBpsFor(totalWagered: MoneyInput): number {
  const wagered = toDecimal(totalWagered);
  let bps = 0;
  for (const tier of RAKEBACK_TIERS) {
    if (wagered.greaterThanOrEqualTo(new Decimal(tier.minWagered))) bps = tier.bps;
  }
  return bps;
}

export interface AccrueInput {
  userId: string;
  /** The player's lifetime wager AFTER this match's stake was locked. */
  totalWagered: MoneyInput;
  /** What this player staked into the match (still-locked + forfeited). */
  stake: MoneyInput;
  /** The match's whole pot. */
  pot: MoneyInput;
  /** The fee/edge the platform actually took on the match. */
  feeCollected: MoneyInput;
}

/**
 * Accrue this player's rakeback for one settled match, inside settlement's own
 * transaction so the accrual commits or rolls back with the settlement.
 *
 * share  = feeCollected × (stake ÷ pot)      the slice of the fee this stake paid
 * amount = share × tier bps                  rounded DOWN to the lamport
 *
 * Integer lamport maths throughout, so no lamport is invented. Returns the
 * amount accrued (0 when the player is below the first tier, the match took no
 * fee, or the amount truncates to nothing — in which case no query runs).
 */
export async function accrueRakeback(tx: Tx, input: AccrueInput): Promise<Decimal> {
  const bps = rakebackBpsFor(input.totalWagered);
  if (bps === 0) return new Decimal(0);

  const pot = toLamports(input.pot);
  const fee = toLamports(input.feeCollected);
  const stake = toLamports(input.stake);
  if (pot <= 0n || fee <= 0n || stake <= 0n) return new Decimal(0);

  const share = (fee * stake) / pot;
  const amount = (share * BigInt(bps)) / 10_000n;
  if (amount <= 0n) return new Decimal(0);

  const accrued = fromLamports(amount);
  await tx.user.update({
    where: { id: input.userId },
    data: { rakebackUnclaimed: { increment: accrued } },
  });
  return accrued;
}
