import { toAmountString, type MoneyInput } from './money.js';
import { explorerTxUrl } from '../config/solana.js';

/**
 * The subset of a `LedgerEntry` row needed to describe it to a client — the
 * same fields `GET /api/wallet/history` already selects. Kept as a loose
 * shape (not the generated Prisma type) so it accepts the plain object
 * returned by any `ledgerEntry.create`/`update` call, transaction-scoped or not.
 */
export interface LedgerEntryLike {
  id: string;
  userId: string | null;
  type: string;
  amount: MoneyInput;
  status: string;
  note: string | null;
  txSignature: string | null;
  gameType: string | null;
  matchId: string | null;
  timestamp: Date;
}

export interface LedgerRow {
  id: string;
  type: string;
  amount: string;
  status: string;
  note: string | null;
  txSignature: string | null;
  explorerUrl: string | null;
  gameType: string | null;
  matchId: string | null;
  timestamp: Date;
}

/** The one place a `LedgerEntry` row becomes wire shape — REST history and the live socket push both go through this. */
export function toLedgerRow(entry: LedgerEntryLike): LedgerRow {
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
