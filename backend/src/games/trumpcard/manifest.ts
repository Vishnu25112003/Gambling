import type { GameManifest } from '../types.js';

export const trumpcardManifest: GameManifest = {
  id: 'trumpcard',
  name: 'Trumpcard',
  tagline: '2-4 player stat-battle — highest stat takes the pile.',
  description:
    'A 52-card stat-battle game (Top Trumps style) for 2 to 4 players. The leader picks a stat from their top card, every active player compares, and the highest value takes the rest. Most cards when time runs out — or last one standing — wins. The number of paid places scales with how many players actually joined.',
  mode: 'pooled',
  minPlayers: 2,
  maxPlayers: 4,
  status: 'live',
  icon: '🃏',
};
