import type { GameManifest } from '../types.js';

export const handCricketManifest: GameManifest = {
  id: 'hand-cricket',
  name: 'Hand Cricket',
  tagline: '1v1 hand cricket — simultaneous number picks decide runs and outs.',
  description:
    'Two players each get one innings at bat. Every ball, both players simultaneously pick a number 1-6 — a match is an out, otherwise the batter scores that many runs. Most total runs across both innings wins; a tie is settled by a 6-ball Super Over. A 3-lives system punishes stalls and disconnects.',
  mode: 'pooled',
  minPlayers: 2,
  maxPlayers: 2,
  status: 'live',
  icon: '🏏',
};
