import type { IconName } from '../shared/icons';

export interface NavItem {
  key: string;
  label: string;
  icon: IconName;
  to: string;
  /** Only the index route needs an exact match. */
  end?: boolean;
}

/**
 * The design's sidebar, in its order. Five of these sections have no backend
 * behind them yet — they render the design's "Nothing here yet" placeholder
 * rather than being hidden, because the sidebar is part of the layout the
 * design specifies.
 */
export const NAV_ITEMS: NavItem[] = [
  { key: 'overview', label: 'Dashboard', icon: 'home', to: '/dashboard', end: true },
  { key: 'games', label: 'Games', icon: 'dice', to: '/dashboard/games' },
  { key: 'mybets', label: 'My Bets', icon: 'ticket', to: '/dashboard/bets' },
  { key: 'transactions', label: 'Transactions', icon: 'receipt', to: '/dashboard/transactions' },
  { key: 'escrow', label: 'Escrow', icon: 'lockbox', to: '/dashboard/escrow' },
  { key: 'leaderboard', label: 'Leaderboard', icon: 'trophy', to: '/dashboard/leaderboard' },
  { key: 'rewards', label: 'Rewards', icon: 'gift', to: '/dashboard/rewards' },
  { key: 'affiliates', label: 'Invite & Earn', icon: 'users', to: '/dashboard/affiliates' },
  { key: 'settings', label: 'Settings', icon: 'cog', to: '/dashboard/settings' },
  { key: 'support', label: 'Support', icon: 'help', to: '/dashboard/support' },
];

/**
 * Copy for the sections that are still placeholders, verbatim from the design.
 *
 * `affiliates` is no longer among them — doc 09 shipped it as a real page, and
 * its design copy ("Earn 5% of every bet your invited friends make") could not
 * ship as written: 5% of every bet is the whole of the platform's own 5% pooled
 * rake. The live rule is 5% of a friend's first winning game.
 */
export const PLACEHOLDER_COPY: Record<string, string> = {
  mybets: 'Every bet you place lands here — open, settled and cancelled.',
  rewards: 'Rakeback, streak bonuses and seasonal drops.',
  support: 'Reach the team, or read the devnet play guide.',
};
