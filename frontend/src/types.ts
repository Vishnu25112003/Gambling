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
  /** Doc 11 — the public handle, lowercase. Null until the player claims one. */
  username: string | null;
  /** Doc 11 — root-relative, with a `?v=` cache-buster. Null = generated gradient. */
  avatarUrl: string | null;
  /** Exact SOL decimal string, e.g. "1.900000000". */
  availableBalance: string;
  lockedBalance: string;
  totalWagered: string;
  netProfit: string;
  gamesPlayed: number;
  gamesWon: number;
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
  /** Doc 11 — the `:handle` for /dashboard/u/:handle. Username, else the user id. */
  handle: string;
  /** Doc 11 — derived from lifetime wagered. */
  tier: TierKey;
  /** Doc 11 — uploaded image, or null for the generated gradient. */
  avatarUrl: string | null;
  /** Doc 11 — shortened address; the gradient seed. Never the full address. */
  walletShort: string;
  netProfit: string;
  totalWagered: string;
  gamesPlayed: number;
  gamesWon: number;
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

// --- doc 11: user profiles -------------------------------------------------

export type TierKey = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';

export interface TierRung {
  key: TierKey;
  label: string;
  /** Exact SOL decimal string. */
  minWagered: string;
  /** 1-based position on the ladder. */
  level: number;
  reached: boolean;
}

export interface TierProgress {
  key: TierKey;
  label: string;
  level: number;
  next: { key: TierKey; label: string; minWagered: string } | null;
  wagered: string;
  /** Null at the top of the ladder. */
  remainingToNext: string | null;
  /** 0-100. A bar width, not money — the one number here that is a number. */
  percentToNext: number;
  ladder: TierRung[];
}

export interface CurrentStreak {
  kind: 'win' | 'loss' | 'none';
  count: number;
}

/**
 * Lifetime figures. `totalDeposited` and `totalWithdrawn` are omitted from
 * another player's profile — they are wallet facts, not a playing record — which
 * is why both are optional here.
 */
export interface ProfileStats {
  gamesPlayed: number;
  gamesWon: number;
  gamesLost: number;
  gamesDrawn: number;
  gamesForfeited: number;
  /** Percent to one decimal, or null for a player who has never finished a match. */
  winRate: number | null;
  totalWagered: string;
  netProfit: string;
  biggestWin: string;
  biggestLoss: string;
  avgStake: string;
  totalDeposited?: string;
  totalWithdrawn?: string;
  referralEarnings: string;
  currentStreak: CurrentStreak;
  bestWinStreak: number;
}

export interface PerGameStat {
  gameType: string;
  played: number;
  won: number;
  lost: number;
  wagered: string;
  netProfit: string;
}

export interface DailyNet {
  /** YYYY-MM-DD. */
  day: string;
  net: string;
  games: number;
}

export interface ProfileIdentity {
  handle: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  /** Own profile only — a public profile carries `walletShort` instead. */
  walletAddress?: string;
  walletShort?: string;
  /** Public profile only: the name to render. */
  label?: string;
  joinedAt: string;
  lastLogin?: string | null;
}

export interface Profile {
  isYou: boolean;
  identity: ProfileIdentity;
  tier: TierProgress;
  stats: ProfileStats;
  perGame: PerGameStat[];
  curve: DailyNet[];
}

export type MatchResult = 'won' | 'lost' | 'draw' | 'refunded' | 'forfeited' | 'open';

export interface MatchHistoryRow {
  matchId: string;
  gameType: string;
  mode: 'pooled' | 'solo_vs_house';
  result: MatchResult;
  stake: string;
  payout: string;
  net: string;
  pot: string;
  settledAt: string | null;
  joinedAt: string;
}

export interface MatchHistoryPage {
  page: number;
  limit: number;
  total: number;
  entries: MatchHistoryRow[];
}

export interface UsernameCheck {
  username: string;
  available: boolean;
  reason: string | null;
}
