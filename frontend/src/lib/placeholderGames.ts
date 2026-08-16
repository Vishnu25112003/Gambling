import type { GameManifest } from '../types';

/**
 * Doc 06: "show 'Coming Soon' placeholders until [games] exist".
 *
 * No games are built yet (04-Games-Index.md is empty), so the UI renders these.
 * The dashboard prefers the real list from GET /api/games and only falls back
 * here when the backend returns none — so the moment a game is registered in
 * backend/src/games/registry.ts, it replaces its placeholder automatically.
 *
 * The six entries and their taglines are the ones the design's game grid shows.
 * They are illustrative, NOT a decision about which games ship — that call
 * belongs to the games pass.
 */
export const PLACEHOLDER_GAMES: GameManifest[] = [
  {
    id: 'coming-soon-coinflip',
    name: 'Coin Flip',
    tagline: 'Heads or tails, double or nothing.',
    description: 'Placeholder card — not yet built.',
    mode: 'solo_vs_house',
    minPlayers: 1,
    maxPlayers: 1,
    status: 'coming-soon',
  },
  {
    id: 'coming-soon-dice',
    name: 'Dice',
    tagline: 'Pick your odds, roll under to win.',
    description: 'Placeholder card — not yet built.',
    mode: 'solo_vs_house',
    minPlayers: 1,
    maxPlayers: 1,
    status: 'coming-soon',
  },
  {
    id: 'coming-soon-mines',
    name: 'Mines',
    tagline: 'Cash out before you hit a bomb.',
    description: 'Placeholder card — not yet built.',
    mode: 'solo_vs_house',
    minPlayers: 1,
    maxPlayers: 1,
    status: 'coming-soon',
  },
  {
    id: 'coming-soon-roulette',
    name: 'Roulette',
    tagline: 'Bet on numbers, colors and more.',
    description: 'Placeholder card — not yet built.',
    mode: 'solo_vs_house',
    minPlayers: 1,
    maxPlayers: 1,
    status: 'coming-soon',
  },
  {
    id: 'coming-soon-crash',
    name: 'Crash',
    tagline: 'Predict the crash, cash out early.',
    description: 'Placeholder card — not yet built.',
    mode: 'pooled',
    minPlayers: 2,
    maxPlayers: 50,
    status: 'coming-soon',
  },
  {
    id: 'coming-soon-blackjack',
    name: 'Blackjack',
    tagline: 'Beat the dealer without busting.',
    description: 'Placeholder card — not yet built.',
    mode: 'solo_vs_house',
    minPlayers: 1,
    maxPlayers: 1,
    status: 'coming-soon',
  },
];
