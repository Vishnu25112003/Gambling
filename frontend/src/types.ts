/**
 * Shapes returned by the backend API.
 *
 * NOTE ON MONEY: every SOL amount is an exact decimal STRING, not a number.
 * The backend stores balances as Postgres NUMERIC(20,9); serialising them as
 * JSON numbers would hand them back to float imprecision. Use the helpers in
 * lib/format.ts to display them, and never do arithmetic on them client-side.
 */

export interface AppUser {
  id: string;
  walletAddress: string;
  displayName: string | null;
  /** Exact SOL decimal string, e.g. "1.900000000". */
  availableBalance: string;
  lockedBalance: string;
  totalWagered: string;
  netProfit: string;
  gamesPlayed: number;
  createdAt?: string;
  lastLogin?: string | null;
}

export interface Balance {
  availableBalance: string;
  lockedBalance: string;
  total: string;
}

export interface WalletInfo {
  treasuryAddress: string | null;
  configured: boolean;
  cluster: string;
  minWithdrawalSol: number;
}

export type LedgerType =
  | 'deposit'
  | 'withdrawal'
  | 'lock'
  | 'settlement'
  | 'refund'
  | 'forfeit'
  | 'fee';

export interface LedgerRow {
  id: string;
  type: LedgerType;
  /** Signed SOL decimal string: negative debits the user. */
  amount: string;
  status: 'pending' | 'confirmed' | 'failed';
  note: string | null;
  txSignature: string | null;
  explorerUrl: string | null;
  gameType: string | null;
  matchId: string | null;
  timestamp: string;
}

export interface HistoryPage {
  page: number;
  limit: number;
  total: number;
  entries: LedgerRow[];
}

export interface LeaderboardEntry {
  rank: number;
  name: string;
  netProfit: string;
  totalWagered: string;
  gamesPlayed: number;
  isYou: boolean;
}

export interface GameManifest {
  id: string;
  name: string;
  tagline: string;
  description: string;
  mode: 'pooled' | 'solo_vs_house';
  minPlayers: number;
  maxPlayers: number;
  status: 'live' | 'beta' | 'coming-soon';
  icon?: string;
}

export interface WithdrawResponse {
  txSignature: string;
  requested: string;
  networkFee: string;
  sent: string;
  availableBalance: string;
  explorerUrl: string;
}
