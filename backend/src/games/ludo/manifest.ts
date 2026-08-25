import type { GameManifest } from '../types.js';

export const ludoManifest: GameManifest = {
  id: 'ludo',
  name: 'Ludo',
  tagline: '2–4 player Ludo — race your tokens home.',
  description:
    'Classic Ludo for 2 to 4 players. Roll dice, move tokens, capture opponents, and race to get all four tokens home. The number of paid places scales with how many players join.',
  mode: 'pooled',
  minPlayers: 2,
  maxPlayers: 4,
  status: 'coming-soon',
  icon: '🎲',
};
