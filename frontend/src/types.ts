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
  | 'fee'
  | 'referral';

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

// --- doc 09: invite & earn ------------------------------------------------

/** `pending` — waiting on this friend's first winning match. `earned` — paid. */
export type ReferralStatus = 'pending' | 'earned';

/**
 * Doc 09 anti-Sybil — what an invited friend must do before a commission is paid.
 * Either field at "0.000000000" means that half of the gate is switched off.
 */
export interface PayoutRequirements {
  /** Exact SOL decimal string. */
  minDeposit: string;
  minWagered: string;
}

export interface ReferredFriend {
  id: string;
  /** Display name, or an abbreviated wallet. Never a full address. */
  name: string;
  status: ReferralStatus;
  /** Exact SOL decimal string; "0.000000000" while pending. */
  earned: string;
  joinedAt: string;
  earnedAt: string | null;
  gameType: string | null;
  /**
   * Doc 09 anti-Sybil — this friend has cleared the deposit/wagering thresholds,
   * so their next win pays out. One boolean by design: a referrer is told whether
   * the reward is live, never how much their friend deposited or wagered.
   */
  unlocked: boolean;
}

export interface ReferralStats {
  code: string;
  link: string;
  /** Basis points — 500 = 5%. */
  commissionBps: number;
  /** Activity an invited friend must reach before a commission is paid. */
  payoutRequirements: PayoutRequirements;
  stats: {
    invited: number;
    pending: number;
    earned: number;
    /** Exact SOL decimal string. */
    totalEarned: string;
  };
  /** True while this player can still apply someone else's code. */
  canEnterCode: boolean;
  referredBy: { name: string; joinedAt: string } | null;
  friends: ReferredFriend[];
}

export interface ReferralLookup {
  valid: boolean;
  referrerName: string | null;
  commissionBps?: number;
}

export interface WithdrawResponse {
  txSignature: string;
  requested: string;
  networkFee: string;
  sent: string;
  availableBalance: string;
  explorerUrl: string;
}
