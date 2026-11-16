import { prisma } from '../config/db.js';
import { Decimal, toAmountString } from '../lib/money.js';
import { emitLedgerEntryCreated } from '../lib/ledgerEvents.js';
import { createLogger } from '../lib/logger.js';
import { badRequest } from '../lib/errors.js';

const log = createLogger('rewards:claim');

export interface ClaimResult {
  /** Exact SOL decimal string that moved into the playable balance. */
  claimed: string;
  availableBalance: string;
}

/**
 * Move a player's whole accrued rakeback into their playable balance.
 *
 * EXACTLY ONCE, even under a double-click or two tabs: a single UPDATE reads
 * the accrued amount, zeroes it and credits the balance in one atomic
 * statement. `FOR UPDATE` on the row lock plus `WHERE amount > 0` means a second
 * concurrent claim either waits and then finds 0 (and is rejected) or never
 * matches — the same conditional-UPDATE idiom `settleMatch` and `lockBalance`
 * use. The ledger row commits in the same transaction, so the credit can never
 * exist without its audit entry, nor the entry without the credit.
 */
export async function claimRakeback(userId: string): Promise<ClaimResult> {
  const entry = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      { claimed: Decimal; available: Decimal; locked: Decimal }[]
    >`
      WITH old AS (
        SELECT id, "rakebackUnclaimed" AS amt
          FROM users
         WHERE id = ${userId}::uuid
           FOR UPDATE
      )
      UPDATE users u
         SET "availableBalance" = u."availableBalance" + old.amt,
             "rakebackUnclaimed" = 0
        FROM old
       WHERE u.id = old.id AND old.amt > 0
      RETURNING old.amt AS claimed,
                u."availableBalance" AS available,
                u."lockedBalance" AS locked
    `;

    const row = rows[0];
    if (!row) throw badRequest('Nothing to claim yet — rakeback accrues as you play.');

    return tx.ledgerEntry.create({
      data: {
        userId,
        type: 'rakeback',
        status: 'confirmed',
        amount: row.claimed,
        balanceAfterAvailable: row.available,
        balanceAfterLocked: row.locked,
        note: 'Rakeback claimed',
        meta: { claimed: toAmountString(row.claimed) },
      },
    });
  });

  emitLedgerEntryCreated(entry);
  log.info('rakeback claimed', { userId, amount: toAmountString(entry.amount) });

  return {
    claimed: toAmountString(entry.amount),
    availableBalance: toAmountString(entry.balanceAfterAvailable ?? 0),
  };
}
