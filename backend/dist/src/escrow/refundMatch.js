import { prisma } from '../config/db.js';
import { conflict, notFound } from '../lib/errors.js';
import { Decimal, toDecimal } from '../lib/money.js';
import { createLogger } from '../lib/logger.js';
import { emitLedgerEntryCreated } from '../lib/ledgerEvents.js';
const log = createLogger('escrow:refund');
/**
 * Doc 03 — full refund to everyone. Crash or cancel only.
 *
 * Doc 03 is explicit: NO FEE IS TAKEN HERE UNDER ANY CIRCUMSTANCE. A server or
 * game crash is the platform's fault, not the player's, so every locked stake
 * goes back untouched. There is deliberately no fee parameter on this function
 * — the rule is not configurable by a caller.
 */
export async function refundMatch(matchId, reason = 'Match refunded') {
    const pushedEntries = [];
    const result = await prisma.$transaction(async (tx) => {
        // Claim atomically so a crash-handler and a manual cancel racing each other
        // cannot both refund the same stakes.
        const claimed = await tx.$executeRaw `
      UPDATE matches
         SET status = 'refunded', "settledAt" = NOW()
       WHERE id = ${matchId}::uuid AND status = 'open'
    `;
        if (claimed === 0) {
            const existing = await tx.match.findUnique({ where: { id: matchId } });
            if (!existing)
                throw notFound('Match not found.');
            throw conflict(`Match is already ${existing.status} and cannot be refunded.`);
        }
        const match = await tx.match.findUniqueOrThrow({
            where: { id: matchId },
            include: { participants: true },
        });
        const refunded = [];
        let total = new Decimal(0);
        for (const participant of match.participants) {
            const stillLocked = toDecimal(participant.lockedAmount);
            // A stake already surrendered to a forfeit is refunded too — the crash
            // invalidates the whole match, including the disconnect that preceded it.
            // It's credited to availableBalance without touching lockedBalance,
            // because forfeitPlayer already unlocked it.
            const forfeited = toDecimal(participant.forfeitedAmount);
            const amount = stillLocked.plus(forfeited);
            if (amount.lessThanOrEqualTo(0)) {
                await tx.matchParticipant.update({
                    where: { id: participant.id },
                    data: { status: 'refunded' },
                });
                continue;
            }
            /**
             * Doc 11 — if this player had already forfeited, `forfeitPlayer` recorded
             * the loss (`netProfit -= amount`) and counted the game
             * (`gamesPlayed += 1`). A refund means the match never happened, so those
             * two have to come back as well — otherwise a crash after a disconnect
             * leaves a permanent phantom loss on the player's record, refunded in money
             * but not in statistics.
             *
             * `gamesPlayed` can't go negative here: the forfeit incremented it earlier
             * in this same match's life, which is the only way `forfeited > 0`.
             */
            const wasForfeited = forfeited.greaterThan(0);
            const user = await tx.user.update({
                where: { id: participant.userId },
                data: {
                    lockedBalance: { decrement: stillLocked },
                    availableBalance: { increment: amount },
                    // A refunded match never happened: unwind the wagered stat too, so a
                    // crash doesn't inflate a player's lifetime volume.
                    totalWagered: { decrement: amount },
                    ...(wasForfeited
                        ? { netProfit: { increment: forfeited }, gamesPlayed: { decrement: 1 } }
                        : {}),
                },
            });
            await tx.matchParticipant.update({
                where: { id: participant.id },
                data: { lockedAmount: 0, forfeitedAmount: 0, payout: amount, status: 'refunded' },
            });
            refunded.push({ userId: participant.userId, amount });
            total = total.plus(amount);
            pushedEntries.push(await tx.ledgerEntry.create({
                data: {
                    userId: participant.userId,
                    type: 'refund',
                    status: 'confirmed',
                    amount,
                    balanceAfterAvailable: user.availableBalance,
                    balanceAfterLocked: user.lockedBalance,
                    matchId,
                    gameType: match.gameType,
                    note: reason,
                },
            }));
        }
        await tx.match.update({ where: { id: matchId }, data: { feeCollected: 0 } });
        log.info('refunded', { matchId, total: total.toFixed(9), players: refunded.length, reason });
        return { matchId, refunded, total };
    });
    pushedEntries.forEach(emitLedgerEntryCreated);
    return result;
}
//# sourceMappingURL=refundMatch.js.map