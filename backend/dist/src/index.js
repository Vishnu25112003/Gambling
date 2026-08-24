import { createServer } from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { connectDb, disconnectDb } from './config/db.js';
import { createSocketServer } from './sockets/index.js';
import { loadGames, initGames, shutdownGames } from './games/registry.js';
import { startDepositListener, stopDepositListener } from './wallet/depositListener.js';
import { isTreasuryConfigured, getTreasuryAddress } from './wallet/treasury.js';
import { recoverOpenMatches, clearAllForfeitTimers } from './escrow/index.js';
import { startNonceSweeper, stopNonceSweeper } from './auth/nonceSweeper.js';
import { ensureAvatarDir } from './profile/avatarStore.js';
import { createLogger } from './lib/logger.js';
const log = createLogger('boot');
async function main() {
    await connectDb();
    // Doc 03's crash rule: anything still `open` belongs to a process that died
    // holding player money. Refund it in full before accepting new traffic.
    await recoverOpenMatches();
    // Postgres has no TTL index, so expired sign-in challenges are swept here.
    startNonceSweeper();
    // Doc 11 — created up front so `express.static` has a directory to serve and
    // the first upload isn't the thing that discovers it's missing.
    await ensureAvatarDir();
    loadGames();
    await initGames();
    const app = createApp();
    const httpServer = createServer(app);
    createSocketServer(httpServer);
    if (isTreasuryConfigured()) {
        await startDepositListener();
    }
    else {
        log.warn('running without a treasury — deposits and withdrawals will return 503');
    }
    httpServer.listen(env.PORT, () => {
        log.info(`API listening on http://localhost:${env.PORT}`);
        log.info(`cluster: ${env.SOLANA_CLUSTER}`);
        log.info(`treasury: ${getTreasuryAddress() ?? '(not configured)'}`);
    });
    const shutdown = async (signal) => {
        log.info(`${signal} received — shutting down`);
        clearAllForfeitTimers();
        stopNonceSweeper();
        await stopDepositListener();
        await shutdownGames();
        httpServer.close();
        await disconnectDb();
        process.exit(0);
    };
    process.on('SIGINT', () => void shutdown('SIGINT'));
    process.on('SIGTERM', () => void shutdown('SIGTERM'));
    /**
     * Last line of defence.
     *
     * Node's default for an unhandled rejection is to kill the process. Most of
     * this server's work happens in socket handlers and timers, which are exactly
     * the places nobody is awaiting — so a single bad round in a single match
     * could otherwise take every player's session, and the REST API, down with it.
     * Modules own their own error handling; this only stops one escaping bug from
     * becoming an outage.
     */
    process.on('unhandledRejection', (reason) => {
        log.error('unhandled promise rejection — staying up', reason);
    });
    process.on('uncaughtException', (err) => {
        log.error('uncaught exception — staying up', err);
    });
}
main().catch((err) => {
    log.error('failed to start', err);
    process.exit(1);
});
//# sourceMappingURL=index.js.map