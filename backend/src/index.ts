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
import { createLogger } from './lib/logger.js';

const log = createLogger('boot');

async function main(): Promise<void> {
  await connectDb();

  // Doc 03's crash rule: anything still `open` belongs to a process that died
  // holding player money. Refund it in full before accepting new traffic.
  await recoverOpenMatches();

  // Postgres has no TTL index, so expired sign-in challenges are swept here.
  startNonceSweeper();

  loadGames();
  await initGames();

  const app = createApp();
  const httpServer = createServer(app);
  createSocketServer(httpServer);

  if (isTreasuryConfigured()) {
    await startDepositListener();
  } else {
    log.warn('running without a treasury — deposits and withdrawals will return 503');
  }

  httpServer.listen(env.PORT, () => {
    log.info(`API listening on http://localhost:${env.PORT}`);
    log.info(`cluster: ${env.SOLANA_CLUSTER}`);
    log.info(`treasury: ${getTreasuryAddress() ?? '(not configured)'}`);
  });

  const shutdown = async (signal: string): Promise<void> => {
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
}

main().catch((err) => {
  log.error('failed to start', err);
  process.exit(1);
});
