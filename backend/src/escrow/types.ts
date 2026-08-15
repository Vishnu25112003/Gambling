import type { Decimal } from '../lib/money.js';
import type { MatchMode } from '../generated/prisma/enums.js';

export type Id = string;

export interface LockResult {
  matchId: string;
  userId: string;
  /** SOL moved from available to locked. */
  locked: Decimal;
  availableBalance: Decimal;
  lockedBalance: Decimal;
}

export interface SettlementPayout {
  userId: string;
  /** SOL credited back to availableBalance. */
  payout: Decimal;
}

export interface SettleResult {
  matchId: string;
  pot: Decimal;
  feeCollected: Decimal;
  payouts: SettlementPayout[];
}

export interface RefundResult {
  matchId: string;
  refunded: { userId: string; amount: Decimal }[];
  total: Decimal;
}

export interface ForfeitResult {
  matchId: string;
  userId: string;
  /** 'reconnected' means the grace period saved them and nothing was lost. */
  outcome: 'reconnected' | 'forfeited' | 'already-resolved';
  forfeitedAmount: Decimal;
}

export interface CreateMatchInput {
  /** The game's identifier, e.g. 'coin-flip'. Doc 03 calls this `gameType`. */
  gameType: string;
  mode: MatchMode;
  gameState?: unknown;
}

export interface SettleMatchOptions {
  /**
   * Fee in basis points taken off the pot.
   *
   * Doc 03: pooled games pass nothing and get the standard 5%; solo-vs-house
   * games pass 0 because the same 5% edge is already inside their odds table,
   * and charging it here would double-dip the player.
   */
  feeBps?: number;
  /** Opaque game result, stored on the Match for history and dispute review. */
  result?: unknown;
}
