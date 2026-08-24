import { prisma } from '../config/db.js';
import { createLogger } from '../lib/logger.js';
import { lockBalance } from './lockBalance.js';
import { settleMatch } from './settleMatch.js';
import { refundMatch } from './refundMatch.js';
import { forfeitPlayer, cancelForfeit, isAwaitingReconnect, clearAllForfeitTimers, RECONNECT_GRACE_MS, } from './forfeitPlayer.js';
const log = createLogger('escrow');
/**
 * ===========================================================================
 * THE ESCROW ADAPTER — the seam the whole architecture hangs on.
 * ===========================================================================
 *
 * Overview doc, principle #2:
 *   "Games never touch the database or treasury wallet directly — they only
 *    call shared functions. This means the deposit/withdraw method can be
 *    upgraded later (treasury model -> real on-chain program) by changing one
 *    implementation, not every game."
 *
 * This file IS that one implementation. A game module imports from
 * `../escrow/index.js` and nothing else money-related. It must never import
 * `prisma`, never touch `availableBalance` itself, and never import the
 * treasury keypair.
 *
 * When the hub moves to an on-chain escrow program, the four functions below
 * get new bodies and every game keeps working untouched. That is the entire
 * point, and it only holds if the rule above is respected — so it is enforced
 * by review, and by the fact that nothing else is exported here.
 *
 * Amounts are exact SOL (Postgres NUMERIC(20,9) / decimal.js). See lib/money.ts:
 * money must never become a JavaScript `number`.
 * ===========================================================================
 */
export const escrow = {
    lockBalance,
    settleMatch,
    refundMatch,
    forfeitPlayer,
    cancelForfeit,
    createMatch,
    isAwaitingReconnect,
    RECONNECT_GRACE_MS,
};
export { lockBalance, settleMatch, refundMatch, forfeitPlayer, cancelForfeit, isAwaitingReconnect, clearAllForfeitTimers, RECONNECT_GRACE_MS, };
export * from './types.js';
/**
 * Open a betting round. Games call this, then `lockBalance` for each player.
 * A match is just a container for stakes — it holds no game rules itself.
 */
export async function createMatch(input) {
    const match = await prisma.match.create({
        data: {
            gameType: input.gameType,
            mode: input.mode,
            status: 'open',
            gameState: (input.gameState ?? null),
        },
        select: { id: true },
    });
    return match.id;
}
/** Read a match back. Games use this for reconnect/state rehydration. */
export async function getMatch(matchId) {
    return prisma.match.findUnique({
        where: { id: matchId },
        include: { participants: true },
    });
}
/**
 * Doc 03's crash rule, applied at boot.
 *
 * A match still sitting in `open` when the process starts means the previous
 * process died holding player funds. Doc 03 is unambiguous: a crash is the
 * platform's fault, so every stake goes back in full with no fee. Running this
 * on startup is what stops a crash from silently freezing player balances.
 */
export async function recoverOpenMatches() {
    const orphans = await prisma.match.findMany({
        where: { status: 'open' },
        select: { id: true },
    });
    if (orphans.length === 0)
        return 0;
    log.warn(`found ${orphans.length} open match(es) left over from a previous run — refunding`);
    let recovered = 0;
    for (const m of orphans) {
        try {
            await refundMatch(m.id, 'Automatic refund: server restarted mid-match');
            recovered += 1;
        }
        catch (err) {
            log.error(`failed to refund orphaned match ${m.id}`, err);
        }
    }
    log.info(`recovered ${recovered}/${orphans.length} orphaned match(es)`);
    return recovered;
}
//# sourceMappingURL=index.js.map