import { prisma } from '../config/db.js';
import { createLogger } from '../lib/logger.js';
const log = createLogger('auth:nonce');
/**
 * MongoDB expired sign-in challenges automatically via a TTL index. Postgres
 * has no equivalent, so expired rows are swept here instead.
 *
 * This is housekeeping only, never a security control: `consumeChallenge`
 * already refuses any nonce whose `expiresAt` has passed, so a challenge is
 * dead the moment it expires whether or not this sweeper has run yet.
 */
const SWEEP_INTERVAL_MS = 10 * 60 * 1_000;
let timer = null;
export async function sweepExpiredNonces() {
    const { count } = await prisma.authNonce.deleteMany({
        where: { expiresAt: { lt: new Date() } },
    });
    if (count > 0)
        log.debug(`swept ${count} expired sign-in challenge(s)`);
    return count;
}
export function startNonceSweeper() {
    if (timer)
        return;
    void sweepExpiredNonces().catch((err) => log.error('initial nonce sweep failed', err));
    timer = setInterval(() => {
        void sweepExpiredNonces().catch((err) => log.error('nonce sweep failed', err));
    }, SWEEP_INTERVAL_MS);
    timer.unref?.();
}
export function stopNonceSweeper() {
    if (!timer)
        return;
    clearInterval(timer);
    timer = null;
}
//# sourceMappingURL=nonceSweeper.js.map