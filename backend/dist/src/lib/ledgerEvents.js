import { createLogger } from './logger.js';
const log = createLogger('ledger:events');
const handlers = new Set();
export function onLedgerEntryCreated(handler) {
    handlers.add(handler);
    return () => handlers.delete(handler);
}
export function emitLedgerEntryCreated(entry) {
    handlers.forEach((h) => {
        try {
            h(entry);
        }
        catch (err) {
            log.error('ledger entry handler threw', err);
        }
    });
}
//# sourceMappingURL=ledgerEvents.js.map