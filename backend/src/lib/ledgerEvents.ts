import { createLogger } from './logger.js';
import type { LedgerEntryLike } from './ledgerRow.js';

const log = createLogger('ledger:events');

/**
 * Fired the moment a ledger row is written, so the socket layer can push it
 * to the owning user instantly instead of waiting for their next poll.
 *
 * Deliberately a plain in-process handler set — the same pattern
 * `depositListener.ts` uses for `onDepositCredited` — rather than importing
 * the socket module directly from every escrow/wallet call site, which would
 * tangle those modules up with `sockets/index.ts`.
 */
type LedgerEntryHandler = (entry: LedgerEntryLike) => void;

const handlers = new Set<LedgerEntryHandler>();

export function onLedgerEntryCreated(handler: LedgerEntryHandler): () => void {
  handlers.add(handler);
  return () => handlers.delete(handler);
}

export function emitLedgerEntryCreated(entry: LedgerEntryLike): void {
  handlers.forEach((h) => {
    try {
      h(entry);
    } catch (err) {
      log.error('ledger entry handler threw', err);
    }
  });
}
