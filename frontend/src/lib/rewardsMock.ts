/**
 * Static placeholder data for the Rewards page. No backend concept of streaks,
 * crates or claim history exists yet — isolated here so a real endpoint later
 * only means replacing this module's exports.
 */

export const MOCK_UNCLAIMED = '0.031200000';

export interface StreakDay {
  day: number;
  state: 'done' | 'today' | 'locked';
}

export const MOCK_STREAK: StreakDay[] = [1, 2, 3, 4, 5, 6, 7].map((day) => ({
  day,
  state: day < 3 ? 'done' : day === 3 ? 'today' : 'locked',
}));

/** Rakeback tiers — an independent progression from the badge rank ladder (Phase 2/4). */
export const RAKEBACK_TIERS: { pct: string; minWagered: number }[] = [
  { pct: '2%', minWagered: 5 },
  { pct: '4%', minWagered: 20 },
  { pct: '6%', minWagered: 75 },
  { pct: '10%', minWagered: 200 },
];

export interface Crate {
  id: string;
  name: string;
  tag: string;
  icon: 'gift' | 'bolt' | 'trophy';
  desc: string;
  progress: number;
  total: number;
  claimable: boolean;
}

export const MOCK_CRATES: Crate[] = [
  {
    id: 'daily',
    name: 'Daily Crate',
    tag: 'DAILY',
    icon: 'gift',
    desc: 'Play one match today to unlock.',
    progress: 1,
    total: 1,
    claimable: true,
  },
  {
    id: 'streak',
    name: 'Streak Crate',
    tag: 'STREAK',
    icon: 'bolt',
    desc: 'Reach a 7-day login streak.',
    progress: 3,
    total: 7,
    claimable: false,
  },
  {
    id: 'season',
    name: 'Season Crate',
    tag: 'SEASON',
    icon: 'trophy',
    desc: 'Finish Season 01 in the top 100.',
    progress: 0,
    total: 1,
    claimable: false,
  },
];

export interface ClaimHistoryRow {
  id: string;
  name: string;
  when: string;
  source: string;
  amount: string;
}

export const MOCK_CLAIMS: ClaimHistoryRow[] = [
  { id: 'c-1', name: 'Daily Crate', when: '2026-09-07T09:00:00Z', source: 'Daily login', amount: '0.005000000' },
  { id: 'c-2', name: 'Rakeback', when: '2026-09-05T09:00:00Z', source: '4% tier', amount: '0.012000000' },
  { id: 'c-3', name: 'Streak Day 3', when: '2026-09-04T09:00:00Z', source: 'Login streak', amount: '0.002000000' },
];
