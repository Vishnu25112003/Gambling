import { Server as SocketServer } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import { corsOrigins } from '../config/env.js';
import { socketAuth } from '../auth/authMiddleware.js';
import { registerGameSockets } from '../games/registry.js';
import { onDepositCredited } from '../wallet/depositListener.js';
import { onLedgerEntryCreated } from '../lib/ledgerEvents.js';
import { toLedgerRow } from '../lib/ledgerRow.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('socket');

let io: SocketServer | null = null;

/** Every socket for a given user joins `user:<id>`, so we can push to all their tabs. */
const userRoom = (userId: string) => `user:${userId}`;

export function createSocketServer(httpServer: HttpServer): SocketServer {
  io = new SocketServer(httpServer, {
    cors: { origin: corsOrigins, credentials: true },
    // Long enough for a page refresh to reuse the session, short enough that a
    // real disconnect still trips doc 03's 15-second forfeit grace period.
    pingTimeout: 10_000,
  });

  // Same JWT as the REST API — an unauthenticated socket never connects.
  io.use((socket, next) => {
    void socketAuth(socket, next);
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId as string;
    void socket.join(userRoom(userId));
    log.debug(`connected ${socket.id} (user ${userId})`);

    socket.emit('connected', { userId, walletAddress: socket.data.walletAddress });

    // Each game attaches its own handlers. None registered yet.
    registerGameSockets(io!.of('/'), socket);

    socket.on('disconnect', (reason) => {
      log.debug(`disconnected ${socket.id} (${reason})`);
      // Game modules own the forfeit call — only they know which match this
      // socket was in, and escrow.forfeitPlayer starts the grace period.
    });
  });

  // Push a live balance update the moment a deposit lands on-chain, so the
  // dashboard updates without the user refreshing.
  onDepositCredited((event) => {
    io?.to(userRoom(event.userId)).emit('wallet:deposit', {
      // Exact decimal strings, never JSON numbers — see lib/money.ts.
      amount: event.amount,
      txSignature: event.txSignature,
      availableBalance: event.availableBalance,
    });
  });

  // Push every notification-worthy ledger row (deposit, withdrawal, a settled
  // match, a refund, a referral bonus, ...) to its owner the instant it's
  // written, in the exact shape `GET /api/wallet/history` already returns —
  // the notification bell renders this without waiting on its next poll.
  onLedgerEntryCreated((entry) => {
    if (!entry.userId) return; // house rows (fee, unmatched deposits) have no owner
    io?.to(userRoom(entry.userId)).emit('ledger:new', toLedgerRow(entry));
  });

  log.info('socket.io ready');
  return io;
}

export function getIo(): SocketServer | null {
  return io;
}

/** Push an arbitrary event to every socket belonging to one user. */
export function emitToUser(userId: string, event: string, payload: unknown): void {
  io?.to(userRoom(userId)).emit(event, payload);
}
