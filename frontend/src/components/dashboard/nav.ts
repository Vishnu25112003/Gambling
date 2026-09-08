import type { IconName } from '../shared/icons';

export interface NavItem {
  key: string;
  label: string;
  icon: IconName;
  to: string;
  /** Only the index route needs an exact match. */
  end?: boolean;
}

/** The design's sidebar, in its order. */
export const NAV_ITEMS: NavItem[] = [
  { key: 'overview', label: 'Dashboard', icon: 'home', to: '/dashboard', end: true },
  // Doc 11 — second, right under the dashboard: identity belongs at the top.
  { key: 'profile', label: 'Profile', icon: 'user', to: '/dashboard/profile' },
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
