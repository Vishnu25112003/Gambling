import { prisma } from '../config/db.js';
import { notFound } from '../lib/errors.js';
import { Decimal, toDecimal } from '../lib/money.js';
import { createLogger } from '../lib/logger.js';
import { emitLedgerEntryCreated } from '../lib/ledgerEvents.js';
const log = createLogger('escrow:forfeit');
/** Doc 03 locks this at 15 seconds. */
export const RECONNECT_GRACE_MS = 15_000;
/**
 * In-flight grace periods, keyed `matchId:userId`.
 *
 * Intentionally in-memory: a grace period is a 15-second window that only means
 * anything while the process owning the socket is alive. If the process dies
 * mid-window, the match is orphaned rather than silently forfeited —
 * `recoverOpenMatches()` in ./index.ts sweeps those on next boot and refunds
 * them, which is doc 03's crash rule.
 *
 * A multi-process deployment would need this in Redis. Single process is
 * correct for the devnet phase and is called out in the README.
 */
const pending = new Map();
const key = (matchId, userId) => `${matchId}:${userId}`;
/**
 * Doc 03 — a player dropped. Start the 15-second countdown.
 *
 * Resolves when the window closes one way or the other:
 *   'reconnected'      → they came back in time, nothing was lost
 *   'forfeited'        → the window expired, their stake went to the pot
 *   'already-resolved' → the match settled/refunded while we were waiting
 */
export function forfeitPlayer(matchId, userId, graceMs = RECONNECT_GRACE_MS) {
    const k = key(matchId, userId);
    // Already counting down for this player — don't start a second clock.
    const existing = pending.get(k);
    if (existing) {
        return new Promise((resolve, reject) => {
            const prevResolve = existing.resolve;
            existing.resolve = (r) => {
                prevResolve(r);
                resolve(r);
            };
            const prevReject = existing.reject;
            existing.reject = (e) => {
                prevReject(e);
                reject(e);
            };
        });
    }
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            pending.delete(k);
            void applyForfeit(matchId, userId).then(resolve).catch(reject);
        }, graceMs);
        // Don't hold the event loop open purely for a pending forfeit.
        timer.unref?.();
        pending.set(k, { timer, resolve, reject });
        void markDisconnected(matchId, userId);
        log.info('grace period started', { matchId, userId, graceMs });
    });
}
/**
 * Doc 03 — the player reconnected inside the window. Cancel the countdown and
 * resume as if nothing happened.
 */
export async function cancelForfeit(matchId, userId) {
    const k = key(matchId, userId);
    const entry = pending.get(k);
    if (!entry)
        return false;
    clearTimeout(entry.timer);
    pending.delete(k);
    await prisma.matchParticipant.updateMany({
        where: { matchId, userId },
        data: { status: 'active' },
    });
    // Doc 03: log the event either way — reconnected or forfeited.
    const ledgerEntry = await prisma.ledgerEntry.create({
        data: {
            userId,
            type: 'forfeit',
            status: 'confirmed',
            amount: 0,
            matchId,
            note: 'Reconnected within grace period — no forfeit',
        },
    });
    emitLedgerEntryCreated(ledgerEntry);
    log.info('reconnected within grace period', { matchId, userId });
    entry.resolve({
        matchId,
        userId,
        outcome: 'reconnected',
        forfeitedAmount: new Decimal(0),
    });
    return true;
}
/** Mark the participant as disconnected so other players see it immediately. */
async function markDisconnected(matchId, userId) {
    await prisma.matchParticipant
        .updateMany({ where: { matchId, userId }, data: { status: 'disconnected' } })
        .catch(() => undefined);
}
/**
 * The window expired. Move the stake out of the player's lockedBalance and
 * leave it in the pot for the remaining participants.
 *
 * The stake is NOT credited to anyone here. It stays in `match.pot`, and
 * settleMatch hands it to whoever wins — which is what "forfeited to the
 * remaining player(s)/pot" means. `forfeitedAmount` records it so settlement
 * doesn't try to unlock the same stake a second time.
 */
async function applyForfeit(matchId, userId) {
    let pushedEntry = null;
    const result = await prisma.$transaction(async (tx) => {
        const match = await tx.match.findUnique({ where: { id: matchId } });
        if (!match)
            throw notFound('Match not found.');
        const resolved = {
            matchId,
            userId,
            outcome: 'already-resolved',
            forfeitedAmount: new Decimal(0),
        };
        if (match.status !== 'open')
            return resolved;
        const participant = await tx.matchParticipant.findUnique({
            where: { matchId_userId: { matchId, userId } },
        });
        if (!participant)
            return resolved;
        const amount = toDecimal(participant.lockedAmount);
        if (amount.lessThanOrEqualTo(0))
            return resolved;
        const user = await tx.user.update({
            where: { id: userId },
            data: {
                lockedBalance: { decrement: amount },
                netProfit: { decrement: amount },
                gamesPlayed: { increment: 1 },
            },
        });
        await tx.matchParticipant.update({
            where: { id: participant.id },
            data: {
                lockedAmount: 0,
                forfeitedAmount: { increment: amount },
                status: 'forfeited',
            },
        });
        pushedEntry = await tx.ledgerEntry.create({
            data: {
                userId,
                type: 'forfeit',
                status: 'confirmed',
                amount: amount.negated(),
                balanceAfterAvailable: user.availableBalance,
                balanceAfterLocked: user.lockedBalance,
                matchId,
                gameType: match.gameType,
                note: `Forfeited after failing to reconnect within ${RECONNECT_GRACE_MS / 1000}s`,
            },
        });
        log.info('forfeited', { matchId, userId, amount: amount.toFixed(9) });
        return { matchId, userId, outcome: 'forfeited', forfeitedAmount: amount };
    });
    if (pushedEntry)
        emitLedgerEntryCreated(pushedEntry);
    return result;
}
/** True if this player is currently inside a grace window. */
export function isAwaitingReconnect(matchId, userId) {
    return pending.has(key(matchId, userId));
}
/** Clear every pending timer — used on shutdown and between tests. */
export function clearAllForfeitTimers() {
    for (const { timer } of pending.values())
        clearTimeout(timer);
    pending.clear();
}
//# sourceMappingURL=forfeitPlayer.js.map