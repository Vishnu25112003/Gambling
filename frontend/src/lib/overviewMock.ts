/**
 * Static placeholder data for the Overview hero's "Live Matches" panel and
 * "Daily Missions" card. Neither has a real backend concept yet (a
 * cross-game open-table feed, a missions/reset-timer system) — isolated here
 * so a real endpoint later only means replacing these exports.
 */

export interface MockLiveMatch {
  id: string;
  gameType: 'coin-flip' | 'ludo' | 'mine-catcher' | 'trumpcard' | 'hand-cricket';
  initial: string;
  title: string;
  meta: string;
  stake: string;
}

export const MOCK_LIVE_MATCHES: MockLiveMatch[] = [
  { id: 'lm-1', gameType: 'mine-catcher', initial: 'M', title: 'Mine Catcher · PvP', meta: 'zoro vs open seat · 2 slots', stake: '0.20 SOL' },
  { id: 'lm-2', gameType: 'ludo', initial: 'L', title: 'Ludo · 4-Player', meta: '3 joined · waiting on 1', stake: '0.10 SOL' },
  { id: 'lm-3', gameType: 'hand-cricket', initial: 'H', title: 'Hand Cricket · 1v1', meta: 'sanji vs open seat', stake: '0.15 SOL' },
  { id: 'lm-4', gameType: 'coin-flip', initial: 'C', title: 'Coin Flip · Instant', meta: 'nami vs open seat', stake: '0.05 SOL' },
];

export interface MockMission {
  id: string;
  title: string;
  reward: string;
  progress: number;
  total: number;
}

export const MOCK_MISSIONS: MockMission[] = [
  { id: 'ms-1', title: 'Play 5 matches', reward: '0.01 SOL', progress: 3, total: 5 },
  { id: 'ms-2', title: 'Win 2 in a row', reward: '0.02 SOL', progress: 1, total: 2 },
  { id: 'ms-3', title: 'Try a new game', reward: '0.005 SOL', progress: 0, total: 1 },
];
