import { toAmountString } from './money.js';
import { explorerTxUrl } from '../config/solana.js';
/** The one place a `LedgerEntry` row becomes wire shape — REST history and the live socket push both go through this. */
export function toLedgerRow(entry) {
    return {
        id: entry.id,
        type: entry.type,
        amount: toAmountString(entry.amount),
        status: entry.status,
        note: entry.note,
        txSignature: entry.txSignature,
        explorerUrl: entry.txSignature ? explorerTxUrl(entry.txSignature) : null,
        gameType: entry.gameType,
        matchId: entry.matchId,
        timestamp: entry.timestamp,
    };
}
//# sourceMappingURL=ledgerRow.js.map