import { prisma } from '../config/db.js';
import { badRequest, conflict, insufficientFunds, notFound } from '../lib/errors.js';
import { isValidAmount, toDecimal } from '../lib/money.js';
import { createLogger } from '../lib/logger.js';
import { emitLedgerEntryCreated } from '../lib/ledgerEvents.js';
const log = createLogger('escrow:lock');
/**
 * Doc 03 — freeze a bet: availableBalance -> lockedBalance.
 *
 * Purely a database operation; no on-chain transaction happens per bet.
 *
 * CONCURRENCY (doc 03: "must run inside a Postgres transaction ... with the
 * balance check in the same transaction, not a separate read-then-write"):
 * the debit is a single conditional UPDATE —
 *
 *     UPDATE users SET "availableBalance" = "availableBalance" - $amount
 *     WHERE id = $user AND "availableBalance" >= $amount
 *
 * Postgres takes a row lock for the duration of that statement and re-evaluates
 * the WHERE clause against the current row, so two concurrent bets serialise on
 * the row rather than both passing a stale read. `count === 0` means the funds
 * weren't there. The surrounding transaction makes the participant row and the
 * ledger entry land atomically with the debit.
 *
 * Max bet is whatever is in availableBalance — doc 03 sets no separate cap.
 */
export async function lockBalance(userId, amount, matchId) {
    if (!isValidAmount(amount)) {
        throw badRequest('Bet amount must be a positive SOL value with at most 9 decimal places.');
    }
    const stake = toDecimal(amount);
    // Populated inside the transaction, broadcast only after it commits —
    // the same pattern settleMatch/refundMatch/forfeitPlayer use, so a stake
    // lock never gets announced to the client before it's actually durable.
    let pushedEntry = null;
    const result = await prisma.$transaction(async (tx) => {
        const match = await tx.match.findUnique({ where: { id: matchId } });
        if (!match)
            throw notFound('Match not found.');
        if (match.status !== 'open') {
            throw conflict(`Cannot bet on a match that is already ${match.status}.`);
        }
        // The conditional debit. This is the race guard.
        const debited = await tx.$executeRaw `
      UPDATE users
         SET "availableBalance" = "availableBalance" - ${stake.toFixed(9)}::numeric,
             "lockedBalance"    = "lockedBalance"    + ${stake.toFixed(9)}::numeric,
             "totalWagered"     = "totalWagered"     + ${stake.toFixed(9)}::numeric,
             "updatedAt"        = NOW()
       WHERE id = ${userId}::uuid
         AND "availableBalance" >= ${stake.toFixed(9)}::numeric
    `;
        if (debited === 0) {
            const exists = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
            if (!exists)
                throw notFound('User not found.');
            throw insufficientFunds('You do not have enough available balance for that bet.');
        }
        const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
        /**
         * One participant row per player per match (enforced by a unique index) —
         * a second lock accumulates onto the existing row.
         *
         * Doc 11 — `stakeTotal` accumulates alongside `lockedAmount` but is never
         * reduced. `settleMatch` zeroes `lockedAmount`, so this is the only record of
         * what was staked once a match is over, and every win/loss/net figure on the
         * profile page is computed against it.
         */
        await tx.matchParticipant.upsert({
            where: { matchId_userId: { matchId, userId } },
            create: { matchId, userId, lockedAmount: stake, stakeTotal: stake, status: 'active' },
            update: { lockedAmount: { increment: stake }, stakeTotal: { increment: stake } },
        });
        await tx.match.update({
            where: { id: matchId },
            data: { pot: { increment: stake } },
        });
        pushedEntry = await tx.ledgerEntry.create({
            data: {
                userId,
                type: 'lock',
                status: 'confirmed',
                amount: stake.negated(),
                balanceAfterAvailable: user.availableBalance,
                balanceAfterLocked: user.lockedBalance,
                matchId,
                gameType: match.gameType,
                note: 'Bet locked',
            },
        });
        log.info('locked', { userId, amount: stake.toFixed(9), matchId });
        return {
            matchId,
            userId,
            locked: stake,
            availableBalance: user.availableBalance,
            lockedBalance: user.lockedBalance,
        };
    });
    if (pushedEntry)
        emitLedgerEntryCreated(pushedEntry);
    return result;
}
//# sourceMappingURL=lockBalance.js.map